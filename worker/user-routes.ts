import { Hono } from "hono";
import type { Context } from "hono";
import type { Env } from './core-utils';
import { SessionEntity, OrgEntity, UserEntity, ModelEntity } from "./entities";
import { ok, bad, notFound, isStr } from './core-utils';
import type { ModelArtifact, PredictionResult, BatchPredictRequest, PredictionBatchResult, AuthResponse, User, OrgState, Role } from "@shared/types";
import { RandomForestClassifier as RFClassifier } from 'ml-random-forest';
import { Matrix } from 'ml-matrix';
import { GBDTClassifier } from "../shared/gbdt";
import { compareModels } from '../src/lib/model-validator';

// --- AUTH UTILITIES ---
async function hashPassword(password: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyAuth(c: Context<{ Bindings: Env }>): Promise<{ userId: string, orgId: string } | null> {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader) return null;
    
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token || token.length === 0) return null;
    
    const session = new SessionEntity(c.env, token);
    if (!(await session.exists())) return null;
    
    const state = await session.getState();
    if (Date.now() > state.exp) {
      await SessionEntity.delete(c.env, token);
      return null;
    }
    return { userId: state.userId, orgId: state.orgId };
  } catch (error) {
    console.error('Auth verification failed:', error);
    return null;
  }
}

// --- PREDICTION UTILITIES ---
function preprocessCustomer(customer: Record<string, any>, modelArtifact: ModelArtifact): number[] {
  return modelArtifact.features.map(feature => {
    const value = customer[feature];
    const encoding = modelArtifact.encodingMap[feature];
    if (encoding) {
      return encoding[String(value)] ?? 0;
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
    const exp = Date.now() + 7 * 24 * 60 * 60 * 1000;
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
    const exp = Date.now() + 7 * 24 * 60 * 60 * 1000;
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

  // --- MODELS ---
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
    
    try {
      const body = await c.req.json<Partial<ModelArtifact>>();
      
      // Validate required fields
      if (!body.name || typeof body.name !== 'string' || body.name.trim() === '') {
        return bad(c, 'Model name is required');
      }
      if (!body.modelJson || typeof body.modelJson !== 'string') {
        return bad(c, 'Model JSON is required');
      }
      
      // Validate model JSON is parseable
      try {
        JSON.parse(body.modelJson);
      } catch {
        return bad(c, 'Invalid model JSON format');
      }
      
      const newModel: ModelArtifact = {
        id: crypto.randomUUID(),
        orgId: authContext.orgId,
        name: body.name.trim(),
        createdAt: Date.now(),
        targetVariable: body.targetVariable || 'unknown',
        features: Array.isArray(body.features) ? body.features : [],
        performance: body.performance || { accuracy: 0, precision: 0, recall: 0, f1: 0, rocAuc: 0, confusionMatrix: { truePositive: 0, trueNegative: 0, falsePositive: 0, falseNegative: 0 } },
        modelJson: body.modelJson,
        encodingMap: body.encodingMap || {},
        featureImportance: body.featureImportance || {},
        algorithm: body.algorithm || 'random_forest'
      };
      const created = await ModelEntity.create(c.env, newModel);
      return ok(c, created);
    } catch (error) {
      console.error('Error creating model:', error);
      return c.json({ success: false, error: 'Failed to create model' }, 500);
    }
  });

  // --- DELETE MODEL ---
  app.delete('/api/models/:id', async (c) => {
    const authContext = await verifyAuth(c);
    if (!authContext) return c.json({ success: false, error: 'Unauthorized' }, 401);

    try {
      const { id } = c.req.param();
      
      if (!id || typeof id !== 'string') {
        return bad(c, 'Model ID is required');
      }

      const modelEntity = new ModelEntity(c.env, id);
      if (!(await modelEntity.exists())) {
        return notFound(c, 'Model not found');
      }

      const model = await modelEntity.getState();
      if (model.orgId !== authContext.orgId) {
        return c.json({ success: false, error: 'Forbidden' }, 403);
      }

      await ModelEntity.delete(c.env, id);
      return ok(c, { message: 'Model deleted successfully' });
    } catch (error) {
      console.error('Error deleting model:', error);
      return c.json({ success: false, error: 'Failed to delete model' }, 500);
    }
  });

  // --- COMPARE MODELS ---
  app.post('/api/models/compare', async (c) => {
    const authContext = await verifyAuth(c);
    if (!authContext) return c.json({ success: false, error: 'Unauthorized' }, 401);

    try {
      const body = await c.req.json<{ modelAId?: string; modelBId?: string }>();
      
      if (!body.modelAId || !body.modelBId) {
        return bad(c, 'Both model IDs are required');
      }

      if (body.modelAId === body.modelBId) {
        return bad(c, 'Cannot compare a model with itself');
      }

      const modelAEntity = new ModelEntity(c.env, body.modelAId);
      const modelBEntity = new ModelEntity(c.env, body.modelBId);

      if (!(await modelAEntity.exists()) || !(await modelBEntity.exists())) {
        return notFound(c, 'One or both models not found');
      }

      const modelA = await modelAEntity.getState();
      const modelB = await modelBEntity.getState();

      if (modelA.orgId !== authContext.orgId || modelB.orgId !== authContext.orgId) {
        return c.json({ success: false, error: 'Forbidden' }, 403);
      }

      const comparison = compareModels(modelA, modelB);

      return ok(c, { modelA, modelB, comparison });
    } catch (error) {
      console.error('Error comparing models:', error);
      return c.json({ success: false, error: 'Failed to compare models' }, 500);
    }
  });

  // --- PYTHON BEYOND WORKER CAPABILITIES ---
  app.post('/api/models/train', async (c) => {
    return c.json({
      success: false,
      error: 'Python ML execution is not supported in the Edge Worker environment. Please start the Node.js server (npm run server) for Python GBDT support.'
    }, 400);
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

  // --- PREDICT ---
  app.post('/api/predict', async (c) => {
    const authContext = await verifyAuth(c);
    if (!authContext) return c.json({ success: false, error: 'Unauthorized' }, 401);
    
    try {
      const body = await c.req.json<{ modelId?: string; customer?: Record<string, any> }>();
      
      // Validate inputs
      if (!body.modelId || typeof body.modelId !== 'string') {
        return bad(c, 'Model ID is required');
      }
      if (!body.customer || typeof body.customer !== 'object') {
        return bad(c, 'Customer data is required');
      }

      const { modelId, customer } = body;
      
      const modelEntity = new ModelEntity(c.env, modelId);
      if (!(await modelEntity.exists())) return notFound(c, 'Model not found');
      
      const modelArtifact = await modelEntity.getState();
      if (modelArtifact.orgId !== authContext.orgId) {
        return c.json({ success: false, error: 'Forbidden' }, 403);
      }

      const inputVector = [preprocessCustomer(customer, modelArtifact)];
      let churnProbability = 0;

      if (modelArtifact.algorithm === 'python_gbdt') {
        return c.json({ success: false, error: 'Python model predictions require the Node.js server.' }, 400);
      } else if (modelArtifact.algorithm === 'gradient_boosting') {
        const classifier = GBDTClassifier.load(JSON.parse(modelArtifact.modelJson));
        churnProbability = classifier.predictProbability(inputVector)[0];
      } else {
        const classifier = RFClassifier.load(JSON.parse(modelArtifact.modelJson));
        const predictionProbaMatrix: any = classifier.predictProbability(inputVector, 1);
        churnProbability = typeof predictionProbaMatrix.get === 'function'
          ? predictionProbaMatrix.get(0, 0)
          : predictionProbaMatrix[0][0] || 0;
      }

      // Ensure probability is in valid range
      churnProbability = Math.max(0, Math.min(1, churnProbability));

      const prediction = churnProbability > 0.5 ? 1 : 0;
      const featureContributions: Record<string, number> = {};
      modelArtifact.features.forEach((f, i) => {
        const importance = modelArtifact.featureImportance?.[f] || 0;
        const value = inputVector[0][i] || 0;
        featureContributions[f] = importance * (value - 0.5) * (prediction === 1 ? 1 : -1);
      });

      return ok(c, { churnProbability, prediction, featureContributions } as PredictionResult);
    } catch (error) {
      console.error('Prediction error:', error);
      return c.json({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Prediction failed' 
      }, 500);
    }
  });

  app.post('/api/batch-predict', async (c) => {
    const authContext = await verifyAuth(c);
    if (!authContext) return c.json({ success: false, error: 'Unauthorized' }, 401);
    
    try {
      const body = await c.req.json<BatchPredictRequest>();
      
      // Validate inputs
      if (!body.modelId || typeof body.modelId !== 'string') {
        return bad(c, 'Model ID is required');
      }
      if (!Array.isArray(body.customers) || body.customers.length === 0) {
        return bad(c, 'Customers array is required and must not be empty');
      }
      
      // Limit batch size
      if (body.customers.length > 10000) {
        return bad(c, 'Batch size exceeds maximum of 10,000 customers');
      }

      const { modelId, customers } = body;
      
      // Check quota
      const orgEntity = new OrgEntity(c.env, authContext.orgId);
      const orgState = await orgEntity.getState();
      if (customers.length > orgState.maxRows) {
        return bad(c, `Batch size exceeds your plan's quota of ${orgState.maxRows} rows.`);
      }

      const modelEntity = new ModelEntity(c.env, modelId);
      if (!(await modelEntity.exists())) return notFound(c, 'Model not found');
      
      const modelArtifact = await modelEntity.getState();
      if (modelArtifact.orgId !== authContext.orgId) {
        return c.json({ success: false, error: 'Forbidden' }, 403);
      }

      const inputMatrix = customers.map(customer => preprocessCustomer(customer, modelArtifact));
      let probabilities: number[] = [];

      if (modelArtifact.algorithm === 'python_gbdt') {
        return c.json({ success: false, error: 'Python model predictions require the Node.js server.' }, 400);
      } else if (modelArtifact.algorithm === 'gradient_boosting') {
        const classifier = GBDTClassifier.load(JSON.parse(modelArtifact.modelJson));
        probabilities = classifier.predictProbability(inputMatrix);
      } else {
        const classifier = RFClassifier.load(JSON.parse(modelArtifact.modelJson));
        const predictionProbaMatrix: any = classifier.predictProbability(inputMatrix, 1);
        for (let i = 0; i < customers.length; i++) {
          const prob = typeof predictionProbaMatrix.get === 'function'
            ? predictionProbaMatrix.get(i, 0)
            : predictionProbaMatrix[i][0] || 0;
          probabilities.push(prob);
        }
      }

      const predictions = customers.map((_, i) => {
        const churnProbability = Math.max(0, Math.min(1, probabilities[i]));
        const prediction = churnProbability > 0.5 ? 1 : 0;
        const featureContributions: Record<string, number> = {};
        modelArtifact.features.forEach((f, j) => {
          const importance = modelArtifact.featureImportance?.[f] || 0;
          const value = inputMatrix[i][j] || 0;
          featureContributions[f] = importance * (value - 0.5) * (prediction === 1 ? 1 : -1);
        });
        return { churnProbability, prediction, featureContributions };
      });

      return ok(c, { predictions, total: predictions.length } as PredictionBatchResult);
    } catch (error) {
      console.error('Batch prediction error:', error);
      return c.json({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Batch prediction failed' 
      }, 500);
    }
  });
}