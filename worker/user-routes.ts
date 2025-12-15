import { Hono } from "hono";
import type { Env } from './core-utils';
import { UserEntity, ChatBoardEntity, ModelEntity } from "./entities";
import { ok, bad, notFound, isStr } from './core-utils';
import type { ModelArtifact, PredictionResult, BatchPredictRequest, PredictionBatchResult } from "@shared/types";
import { RandomForestClassifier as RFClassifier } from 'ml-random-forest';
function preprocessCustomer(customer: Record<string, any>, modelArtifact: ModelArtifact): number[] {
  return modelArtifact.features.map(feature => {
    const value = customer[feature];
    const encoding = modelArtifact.encodingMap[feature];
    if (encoding) {
      return encoding[String(value)] ?? 0; // Default to 0 for unseen categories
    }
    // Attempt to convert to number, default to 0 if not a valid number
    const numValue = Number(value);
    return !isNaN(numValue) ? numValue : 0;
  });
}
export function userRoutes(app: Hono<{ Bindings: Env }>) {
  app.get('/api/test', (c) => c.json({ success: true, data: { name: 'CF Workers Demo' }}));
  // MODELS
  app.get('/api/models', async (c) => {
    const page = await ModelEntity.list(c.env);
    return ok(c, page);
  });
  app.post('/api/models', async (c) => {
    const body = await c.req.json<Partial<ModelArtifact>>();
    if (!body.name || !body.modelJson) {
      return bad(c, 'Model name and modelJson are required');
    }
    const newModel: ModelArtifact = {
      id: crypto.randomUUID(),
      name: body.name,
      createdAt: Date.now(),
      targetVariable: body.targetVariable || 'unknown',
      features: body.features || [],
      performance: body.performance || { accuracy: 0, precision: 0, recall: 0, f1: 0, rocAuc: 0, confusionMatrix: { truePositive: 0, trueNegative: 0, falsePositive: 0, falseNegative: 0 } },
      modelJson: body.modelJson,
      encodingMap: body.encodingMap || {},
      featureImportance: body.featureImportance || {},
    };
    const created = await ModelEntity.create(c.env, newModel);
    return ok(c, created);
  });
  app.get('/api/models/:id', async (c) => {
    const { id } = c.req.param();
    const model = new ModelEntity(c.env, id);
    if (!(await model.exists())) {
      return notFound(c, 'Model not found');
    }
    return ok(c, await model.getState());
  });
  // PREDICTION
  app.post('/api/predict', async (c) => {
    try {
      const { modelId, customer } = await c.req.json<{ modelId: string; customer: Record<string, any> }>();
      if (!modelId || !customer) return bad(c, 'modelId and customer data are required');
      const modelEntity = new ModelEntity(c.env, modelId);
      if (!(await modelEntity.exists())) return notFound(c, 'Model not found');
      const modelArtifact = await modelEntity.getState();
      const modelData = JSON.parse(modelArtifact.modelJson);
      const classifier = RFClassifier.load(modelData, { seed: 42 });
      const inputVector = [preprocessCustomer(customer, modelArtifact)];
      const predictionProbaMatrix = classifier.predictProbability(inputVector);
      const probaMatrix: number[][] = Array.isArray(predictionProbaMatrix) ? predictionProbaMatrix : (predictionProbaMatrix as any).to2DArray();
      const churnProbability = probaMatrix[0]?.[1] || 0;
      const prediction = churnProbability > 0.5 ? 1 : 0;
      const featureContributions: Record<string, number> = {};
      modelArtifact.features.forEach((f, i) => {
        const importance = modelArtifact.featureImportance?.[f] || 0;
        const value = inputVector[0][i] || 0;
        // Simplified SHAP-like contribution: importance * (value deviation)
        featureContributions[f] = importance * (value - 0.5) * (prediction === 1 ? 1 : -1);
      });
      const result: PredictionResult = { churnProbability, prediction, featureContributions };
      return ok(c, result);
    } catch (error) {
      console.error("Prediction error:", error);
      return c.json({ success: false, error: 'Prediction failed' }, 500);
    }
  });
  app.post('/api/batch-predict', async (c) => {
    try {
      const { modelId, customers } = await c.req.json<BatchPredictRequest>();
      if (!modelId || !customers || !Array.isArray(customers)) return bad(c, 'modelId and a customer array are required');
      if (customers.length > 1000) return bad(c, 'Batch size cannot exceed 1000 customers.');
      const modelEntity = new ModelEntity(c.env, modelId);
      if (!(await modelEntity.exists())) return notFound(c, 'Model not found');
      const modelArtifact = await modelEntity.getState();
      const modelData = JSON.parse(modelArtifact.modelJson);
      const classifier = RFClassifier.load(modelData, { seed: 42 });
      const predictions: PredictionResult[] = customers.map(customer => {
        const inputVector = [preprocessCustomer(customer, modelArtifact)];
        const predictionProbaMatrix = classifier.predictProbability(inputVector);
        const probaMatrix: number[][] = Array.isArray(predictionProbaMatrix) ? predictionProbaMatrix : (predictionProbaMatrix as any).to2DArray();
        const churnProbability = probaMatrix[0]?.[1] || 0;
        const prediction = churnProbability > 0.5 ? 1 : 0;
        const featureContributions: Record<string, number> = {};
        modelArtifact.features.forEach((f, i) => {
          const importance = modelArtifact.featureImportance?.[f] || 0;
          const value = inputVector[0][i] || 0;
          featureContributions[f] = importance * (value - 0.5) * (prediction === 1 ? 1 : -1);
        });
        return { churnProbability, prediction, featureContributions };
      });
      const result: PredictionBatchResult = { predictions, total: predictions.length };
      return ok(c, result);
    } catch (error) {
      console.error("Batch prediction error:", error);
      return c.json({ success: false, error: 'Batch prediction failed' }, 500);
    }
  });
  // --- DEMO ROUTES ---
  app.get('/api/users', async (c) => {
    await UserEntity.ensureSeed(c.env);
    const cq = c.req.query('cursor');
    const lq = c.req.query('limit');
    const page = await UserEntity.list(c.env, cq ?? null, lq ? Math.max(1, (Number(lq) | 0)) : undefined);
    return ok(c, page);
  });
  app.post('/api/users', async (c) => {
    const { name } = (await c.req.json()) as { name?: string };
    if (!name?.trim()) return bad(c, 'name required');
    return ok(c, await UserEntity.create(c.env, { id: crypto.randomUUID(), name: name.trim() }));
  });
  app.get('/api/chats', async (c) => {
    await ChatBoardEntity.ensureSeed(c.env);
    const cq = c.req.query('cursor');
    const lq = c.req.query('limit');
    const page = await ChatBoardEntity.list(c.env, cq ?? null, lq ? Math.max(1, (Number(lq) | 0)) : undefined);
    return ok(c, page);
  });
  app.post('/api/chats', async (c) => {
    const { title } = (await c.req.json()) as { title?: string };
    if (!title?.trim()) return bad(c, 'title required');
    const created = await ChatBoardEntity.create(c.env, { id: crypto.randomUUID(), title: title.trim(), messages: [] });
    return ok(c, { id: created.id, title: created.title });
  });
  app.get('/api/chats/:chatId/messages', async (c) => {
    const chat = new ChatBoardEntity(c.env, c.req.param('chatId'));
    if (!await chat.exists()) return notFound(c, 'chat not found');
    return ok(c, await chat.listMessages());
  });
  app.post('/api/chats/:chatId/messages', async (c) => {
    const chatId = c.req.param('chatId');
    const { userId, text } = (await c.req.json()) as { userId?: string; text?: string };
    if (!isStr(userId) || !text?.trim()) return bad(c, 'userId and text required');
    const chat = new ChatBoardEntity(c.env, chatId);
    if (!await chat.exists()) return notFound(c, 'chat not found');
    return ok(c, await chat.sendMessage(userId, text.trim()));
  });
  app.delete('/api/users/:id', async (c) => ok(c, { id: c.req.param('id'), deleted: await UserEntity.delete(c.env, c.req.param('id')) }));
  app.post('/api/users/deleteMany', async (c) => {
    const { ids } = (await c.req.json()) as { ids?: string[] };
    const list = ids?.filter(isStr) ?? [];
    if (list.length === 0) return bad(c, 'ids required');
    return ok(c, { deletedCount: await UserEntity.deleteMany(c.env, list), ids: list });
  });
  app.delete('/api/chats/:id', async (c) => ok(c, { id: c.req.param('id'), deleted: await ChatBoardEntity.delete(c.env, c.req.param('id')) }));
  app.post('/api/chats/deleteMany', async (c) => {
    const { ids } = (await c.req.json()) as { ids?: string[] };
    const list = ids?.filter(isStr) ?? [];
    if (list.length === 0) return bad(c, 'ids required');
    return ok(c, { deletedCount: await ChatBoardEntity.deleteMany(c.env, list), ids: list });
  });
}