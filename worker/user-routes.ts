import { Hono } from "hono";
import type { Env } from './core-utils';
import { UserEntity, ChatBoardEntity, ModelEntity } from "./entities";
import { ok, bad, notFound, isStr } from './core-utils';
import type { ModelArtifact, PredictionResult } from "@shared/types";
import { RandomForestClassifier as RFClassifier } from 'ml-random-forest';
import { Matrix } from 'ml-matrix';
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
      performance: body.performance || { accuracy: 0, precision: 0, recall: 0, f1: 0, rocAuc: 0, confusionMatrix: { tp: 0, tn: 0, fp: 0, fn: 0 } },
      modelJson: body.modelJson,
      encodingMap: body.encodingMap || {},
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
      if (!modelId || !customer) {
        return bad(c, 'modelId and customer data are required');
      }
      const modelEntity = new ModelEntity(c.env, modelId);
      if (!(await modelEntity.exists())) {
        return notFound(c, 'Model not found');
      }
      const modelArtifact = await modelEntity.getState();
      const classifier = RFClassifier.load(JSON.parse(modelArtifact.modelJson));
      // Preprocess input customer data to match training
      const inputVector = new Matrix(1, modelArtifact.features.length);
      modelArtifact.features.forEach((feature, i) => {
        const value = customer[feature];
        const encoding = modelArtifact.encodingMap[feature];
        if (encoding) { // Categorical
          inputVector.set(0, i, encoding[String(value)] ?? 0); // Default to 0 if category not seen
        } else { // Numerical
          inputVector.set(0, i, typeof value === 'number' ? value : 0); // Default to 0 if missing
        }
      });
      const predictionProba = classifier.predictProbability(inputVector);
      const churnProbability = predictionProba[0][1]; // Probability of class '1'
      const prediction = churnProbability > 0.5 ? 1 : 0;
      // Mock feature contributions for now, as SHAP is complex
      const featureContributions: Record<string, number> = {};
      modelArtifact.features.forEach(f => {
        featureContributions[f] = Math.random() * (prediction === 1 ? 1 : -1);
      });
      const result: PredictionResult = {
        churnProbability,
        prediction,
        featureContributions,
      };
      return ok(c, result);
    } catch (error) {
      console.error("Prediction error:", error);
      return c.json({ success: false, error: 'Prediction failed' }, 500);
    }
  });
  // --- DEMO ROUTES ---
  // USERS
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
  // CHATS
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
  // MESSAGES
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
  // DELETE: Users
  app.delete('/api/users/:id', async (c) => ok(c, { id: c.req.param('id'), deleted: await UserEntity.delete(c.env, c.req.param('id')) }));
  app.post('/api/users/deleteMany', async (c) => {
    const { ids } = (await c.req.json()) as { ids?: string[] };
    const list = ids?.filter(isStr) ?? [];
    if (list.length === 0) return bad(c, 'ids required');
    return ok(c, { deletedCount: await UserEntity.deleteMany(c.env, list), ids: list });
  });
  // DELETE: Chats
  app.delete('/api/chats/:id', async (c) => ok(c, { id: c.req.param('id'), deleted: await ChatBoardEntity.delete(c.env, c.req.param('id')) }));
  app.post('/api/chats/deleteMany', async (c) => {
    const { ids } = (await c.req.json()) as { ids?: string[] };
    const list = ids?.filter(isStr) ?? [];
    if (list.length === 0) return bad(c, 'ids required');
    return ok(c, { deletedCount: await ChatBoardEntity.deleteMany(c.env, list), ids: list });
  });
}