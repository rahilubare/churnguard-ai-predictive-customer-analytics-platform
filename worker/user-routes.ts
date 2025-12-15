import { Hono } from "hono";
import type { Context } from "hono";
import type { Env } from './core-utils';
import { SessionEntity, OrgEntity, UserEntity, ModelEntity } from "./entities";
import { ok, bad, notFound, isStr } from './core-utils';
import type { ModelArtifact, PredictionResult, BatchPredictRequest, PredictionBatchResult, AuthResponse, User, OrgState, Role } from "@shared/types";
import { RandomForestClassifier as RFClassifier } from 'ml-random-forest';
import { Matrix } from 'ml-matrix';
// --- AUTH UTILITIES ---
async function hashPassword(password: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}
async function verifyAuth(c: Context<{ Bindings: Env }>): Promise<{ userId: string, orgId: string } | null> {
  const authHeader = c.req.header('Authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return null;
  try {
    const session = new SessionEntity(c.env, token);
    if (!(await session.exists())) return null;
    const state = await session.getState();
    if (Date.now() > state.exp) {
      await session.delete();
      return null;
    }
    return { userId: state.userId, orgId: state.orgId };
  } catch {
    return null;
  }
}
// --- PREDICTION UTILITIES ---
function preprocessCustomer(customer: Record<string, any>, modelArtifact: ModelArtifact): number[] {
  return modelArtifact.features.map(feature => {
    const value = customer[feature];
    const encoding = modelArtifact.encodingMap[feature];
    if (encoding) {
      return encoding[String(value)] ?? 0; // Default to 0 for unseen categories
    }
    const numValue = Number(value);
    return !isNaN(numValue) ? numValue : 0;
  });
}
export function userRoutes(app: Hono<{ Bindings: Env }>) {
  // --- AUTH ROUTES ---
  app.post('/api/auth/register', async (c) => {
    const { email, password, orgName } = await c.req.json<{ email?: string, password?: string, orgName?: string }>();
    if (!isStr(email) || !isStr(password) || !isStr(orgName)) return bad(c, 'Email, password, and organization name are required.');
    const { items: existingUsers } = await UserEntity.list(c.env);
    if (existingUsers.some(u => u.email === email)) return bad(c, 'An account with this email already exists.');
    const userId = crypto.randomUUID();
    const passwordHash = await hashPassword(password, userId);
    const orgId = crypto.randomUUID();
    const newUser: User = { id: userId, email, passwordHash, orgId, role: 'owner' as Role };
    const newOrg: OrgState = { id: orgId, name: orgName, subTier: 'free', maxRows: 10000 };
    await UserEntity.create(c.env, newUser);
    await OrgEntity.create(c.env, newOrg);
    const token = crypto.randomUUID();
    const exp = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
    await SessionEntity.create(c.env, { id: token, userId, orgId, exp });
    const response: AuthResponse = {
      token,
      user: { id: userId, email, role: 'owner' as Role },
      org: { id: orgId, name: orgName, subTier: 'free' },
    };
    return ok(c, response);
  });
  app.post('/api/auth/login', async (c) => {
    const { email, password } = await c.req.json<{ email?: string, password?: string }>();
    if (!isStr(email) || !isStr(password)) return bad(c, 'Email and password are required.');
    const { items: allUsers } = await UserEntity.list(c.env);
    const userMatch = allUsers.find(u => u.email === email);
    if (!userMatch) return bad(c, 'Invalid credentials.');
    const passwordHash = await hashPassword(password, userMatch.id);
    if (passwordHash !== userMatch.passwordHash) return bad(c, 'Invalid credentials.');
    const orgEntity = new OrgEntity(c.env, userMatch.orgId);
    const org = await orgEntity.getState();
    const token = crypto.randomUUID();
    const exp = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
    await SessionEntity.create(c.env, { id: token, userId: userMatch.id, orgId: userMatch.orgId, exp });
    const response: AuthResponse = {
      token,
      user: { id: userMatch.id, email: userMatch.email, role: userMatch.role },
      org: { id: org.id, name: org.name, subTier: org.subTier },
    };
    return ok(c, response);
  });
  app.get('/api/org/me', async (c) => {
    const authContext = await verifyAuth(c);
    if (!authContext) return c.json({ success: false, error: 'Unauthorized' }, 401);
    const orgEntity = new OrgEntity(c.env, authContext.orgId);
    if (!(await orgEntity.exists())) return notFound(c, 'Organization not found');
    return ok(c, await orgEntity.getState());
  });
  // --- SECURED MODEL ROUTES ---
  app.get('/api/models', async (c) => {
    const authContext = await verifyAuth(c);
    if (!authContext) return c.json({ success: false, error: 'Unauthorized' }, 401);
    const { items } = await ModelEntity.list(c.env);
    const orgModels = items.filter(m => m.orgId === authContext.orgId);
    return ok(c, { items: orgModels, next: null });
  });
  app.post('/api/models', async (c) => {
    const authContext = await verifyAuth(c);
    if (!authContext) return c.json({ success: false, error: 'Unauthorized' }, 401);
    const body = await c.req.json<Partial<ModelArtifact>>();
    if (!body.name || !body.modelJson) return bad(c, 'Model name and modelJson are required');
    const newModel: ModelArtifact = {
      id: crypto.randomUUID(),
      orgId: authContext.orgId,
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
    const authContext = await verifyAuth(c);
    if (!authContext) return c.json({ success: false, error: 'Unauthorized' }, 401);
    const { id } = c.req.param();
    const model = new ModelEntity(c.env, id);
    if (!(await model.exists())) return notFound(c, 'Model not found');
    const modelState = await model.getState();
    if (modelState.orgId !== authContext.orgId) return c.json({ success: false, error: 'Forbidden' }, 403);
    return ok(c, modelState);
  });
  // --- SECURED PREDICTION ROUTES (WITH TS FIXES) ---
  app.post('/api/predict', async (c) => {
    const authContext = await verifyAuth(c);
    if (!authContext) return c.json({ success: false, error: 'Unauthorized' }, 401);
    try {
      const { modelId, customer } = await c.req.json<{ modelId: string; customer: Record<string, any> }>();
      if (!modelId || !customer) return bad(c, 'modelId and customer data are required');
      const modelEntity = new ModelEntity(c.env, modelId);
      if (!(await modelEntity.exists())) return notFound(c, 'Model not found');
      const modelArtifact = await modelEntity.getState();
      if (modelArtifact.orgId !== authContext.orgId) return c.json({ success: false, error: 'Forbidden' }, 403);
      const modelData = JSON.parse(modelArtifact.modelJson);
      const classifier = RFClassifier.load(modelData);
      const inputVector = [preprocessCustomer(customer, modelArtifact)];
      const inputMatrix = new Matrix(inputVector);
      const predictionProbaMatrix = classifier.predictProbability(inputMatrix);
      const probaMatrix: number[][] = Array.isArray(predictionProbaMatrix) ? predictionProbaMatrix : (predictionProbaMatrix as any).to2DArray();
      const churnProbability = probaMatrix[0]?.[1] || 0;
      const prediction = churnProbability > 0.5 ? 1 : 0;
      const featureContributions: Record<string, number> = {};
      modelArtifact.features.forEach((f, i) => {
        const importance = modelArtifact.featureImportance?.[f] || 0;
        const value = inputVector[0][i] || 0;
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
    const authContext = await verifyAuth(c);
    if (!authContext) return c.json({ success: false, error: 'Unauthorized' }, 401);
    try {
      const { modelId, customers } = await c.req.json<BatchPredictRequest>();
      if (!modelId || !customers || !Array.isArray(customers)) return bad(c, 'modelId and a customer array are required');
      if (customers.length > 1000) return bad(c, 'Batch size cannot exceed 1000 customers.');
      const modelEntity = new ModelEntity(c.env, modelId);
      if (!(await modelEntity.exists())) return notFound(c, 'Model not found');
      const modelArtifact = await modelEntity.getState();
      if (modelArtifact.orgId !== authContext.orgId) return c.json({ success: false, error: 'Forbidden' }, 403);
      const modelData = JSON.parse(modelArtifact.modelJson);
      const classifier = RFClassifier.load(modelData);
      const predictions: PredictionResult[] = customers.map(customer => {
        const inputVector = [preprocessCustomer(customer, modelArtifact)];
        const inputMatrix = new Matrix(inputVector);
        const predictionProbaMatrix = classifier.predictProbability(inputMatrix);
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
  // --- PYTHON PROXY STUBS ---
  app.post('/api/orgs/:orgId/train', async (c) => {
    const authContext = await verifyAuth(c);
    if (!authContext || c.req.param('orgId') !== authContext.orgId) return c.json({ success: false, error: 'Forbidden' }, 403);
    return ok(c, { status: 'mock training started', version: 'py-1.0' });
  });
  app.post('/api/orgs/:orgId/predict', async (c) => {
    const authContext = await verifyAuth(c);
    if (!authContext || c.req.param('orgId') !== authContext.orgId) return c.json({ success: false, error: 'Forbidden' }, 403);
    return ok(c, { prediction: 0, probability: 0.1, version: 'py-1.0' });
  });
}