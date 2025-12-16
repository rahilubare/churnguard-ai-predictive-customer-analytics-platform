import { Hono } from "hono";
import { query } from "./db";
import { v4 as uuidv4 } from 'uuid';
import { RandomForestClassifier as RFClassifier } from 'ml-random-forest';
import type { ModelArtifact, PredictionResult, BatchPredictRequest, PredictionBatchResult, AuthResponse, User, OrgState, Role } from "@shared/types";
import crypto from 'node:crypto';

// --- AUTH UTILITIES ---
async function hashPassword(password: string, salt: string): Promise<string> {
    // Using same simple hashing for demo consistency, but in prod use bcrypt/argon2
    const hash = crypto.createHash('sha256').update(password + salt).digest('hex');
    return hash;
}

async function verifyAuth(c: any): Promise<{ userId: string, orgId: string } | null> {
    const authHeader = c.req.header('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    if (!token) return null;

    try {
        const result = await query('SELECT user_id, org_id, exp FROM Sessions WHERE id = @token', { token });
        if (result.recordset.length === 0) return null;

        const session = result.recordset[0];
        if (Date.now() > Number(session.exp)) {
            await query('DELETE FROM Sessions WHERE id = @token', { token });
            return null;
        }
        return { userId: session.user_id, orgId: session.org_id };
    } catch (e) {
        console.error('Auth verification failed', e);
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

export function userRoutes(app: Hono) {
    // --- AUTH ROUTES ---
    app.post('/api/auth/register', async (c) => {
        const { email, password, orgName } = await c.req.json<{ email?: string, password?: string, orgName?: string }>();
        if (!email || !password || !orgName) return c.json({ success: false, error: 'Missing fields' }, 400);

        const existing = await query('SELECT id FROM Users WHERE email = @email', { email });
        if (existing.recordset.length > 0) return c.json({ success: false, error: 'User exists' }, 400);

        const userId = uuidv4();
        const passwordHash = await hashPassword(password, userId);
        const orgId = uuidv4();

        // Transaction ideally
        await query('INSERT INTO Orgs (id, name) VALUES (@id, @name)', { id: orgId, name: orgName });
        await query('INSERT INTO Users (id, email, password_hash, org_id, role) VALUES (@id, @email, @hash, @orgId, @role)',
            { id: userId, email, hash: passwordHash, orgId, role: 'owner' });

        const token = uuidv4();
        const exp = Date.now() + 7 * 24 * 60 * 60 * 1000;
        await query('INSERT INTO Sessions (id, user_id, org_id, exp) VALUES (@id, @userId, @orgId, @exp)',
            { id: token, userId, orgId, exp });

        const response: AuthResponse = {
            token,
            user: { id: userId, email, role: 'owner' },
            org: { id: orgId, name: orgName, subTier: 'free' }
        };
        return c.json({ success: true, data: response });
    });

    app.post('/api/auth/login', async (c) => {
        const { email, password } = await c.req.json<{ email?: string, password?: string }>();
        if (!email || !password) return c.json({ success: false, error: 'Missing fields' }, 400);

        const userResult = await query('SELECT * FROM Users WHERE email = @email', { email });
        if (userResult.recordset.length === 0) return c.json({ success: false, error: 'Invalid credentials' }, 400);

        const user = userResult.recordset[0];
        const passwordHash = await hashPassword(password, user.id);
        if (passwordHash !== user.password_hash) return c.json({ success: false, error: 'Invalid credentials' }, 400);

        const orgResult = await query('SELECT * FROM Orgs WHERE id = @id', { id: user.org_id });
        const org = orgResult.recordset[0];

        const token = uuidv4();
        const exp = Date.now() + 7 * 24 * 60 * 60 * 1000;
        await query('INSERT INTO Sessions (id, user_id, org_id, exp) VALUES (@id, @userId, @orgId, @exp)',
            { id: token, userId: user.id, orgId: user.org_id, exp });

        const response: AuthResponse = {
            token,
            user: { id: user.id, email: user.email, role: user.role as Role },
            org: { id: org.id, name: org.name, subTier: org.sub_tier as any }
        };
        return c.json({ success: true, data: response });
    });

    app.get('/api/org/me', async (c) => {
        const auth = await verifyAuth(c);
        if (!auth) return c.json({ success: false, error: 'Unauthorized' }, 401);

        const orgResult = await query('SELECT * FROM Orgs WHERE id = @id', { id: auth.orgId });
        if (orgResult.recordset.length === 0) return c.json({ success: false, error: 'Not Found' }, 404);

        const org = orgResult.recordset[0];
        return c.json({
            success: true, data: {
                id: org.id,
                name: org.name,
                subTier: org.sub_tier,
                maxRows: org.max_rows
            }
        });
    });

    // --- MODELS ---
    app.get('/api/models', async (c) => {
        const auth = await verifyAuth(c);
        if (!auth) return c.json({ success: false, error: 'Unauthorized' }, 401);

        const result = await query('SELECT * FROM Models WHERE org_id = @orgId ORDER BY created_at DESC', { orgId: auth.orgId });

        const items = result.recordset.map(row => ({
            id: row.id,
            orgId: row.org_id,
            name: row.name,
            createdAt: Number(row.created_at),
            targetVariable: row.target_variable,
            features: JSON.parse(row.features),
            performance: JSON.parse(row.performance),
            modelJson: row.model_json,
            encodingMap: JSON.parse(row.encoding_map),
            featureImportance: JSON.parse(row.feature_importance)
        }));

        return c.json({ success: true, data: { items, next: null } });
    });

    app.post('/api/models', async (c) => {
        const auth = await verifyAuth(c);
        if (!auth) return c.json({ success: false, error: 'Unauthorized' }, 401);

        const body = await c.req.json<Partial<ModelArtifact>>();
        if (!body.name || !body.modelJson) return c.json({ success: false, error: 'Missing fields' }, 400);

        const newModel: ModelArtifact = {
            id: uuidv4(),
            orgId: auth.orgId,
            name: body.name,
            createdAt: Date.now(),
            targetVariable: body.targetVariable || 'unknown',
            features: body.features || [],
            performance: body.performance || { accuracy: 0, precision: 0, recall: 0, f1: 0, rocAuc: 0, confusionMatrix: { truePositive: 0, trueNegative: 0, falsePositive: 0, falseNegative: 0 } },
            modelJson: body.modelJson,
            encodingMap: body.encodingMap || {},
            featureImportance: body.featureImportance || {},
        };

        await query(`INSERT INTO Models (id, org_id, name, created_at, target_variable, features, performance, encoding_map, feature_importance, model_json)
     VALUES (@id, @orgId, @name, @createdAt, @targetVariable, @features, @performance, @encodingMap, @featureImportance, @modelJson)`, {
            id: newModel.id,
            orgId: newModel.orgId,
            name: newModel.name,
            createdAt: newModel.createdAt,
            targetVariable: newModel.targetVariable,
            features: JSON.stringify(newModel.features),
            performance: JSON.stringify(newModel.performance),
            encodingMap: JSON.stringify(newModel.encodingMap),
            featureImportance: JSON.stringify(newModel.featureImportance),
            modelJson: newModel.modelJson
        });

        return c.json({ success: true, data: newModel });
    });

    // --- PREDICT ---
    app.post('/api/predict', async (c) => {
        const auth = await verifyAuth(c);
        if (!auth) return c.json({ success: false, error: 'Unauthorized' }, 401);

        const { modelId, customer } = await c.req.json<{ modelId: string; customer: Record<string, any> }>();

        const result = await query('SELECT * FROM Models WHERE id = @id', { id: modelId });
        if (result.recordset.length === 0) return c.json({ success: false, error: 'Model not found' }, 404);

        const row = result.recordset[0];
        if (row.org_id !== auth.orgId) return c.json({ success: false, error: 'Forbidden' }, 403);

        const modelArtifact: ModelArtifact = {
            id: row.id,
            orgId: row.org_id,
            name: row.name,
            createdAt: Number(row.created_at),
            targetVariable: row.target_variable,
            features: JSON.parse(row.features),
            performance: JSON.parse(row.performance),
            modelJson: row.model_json,
            encodingMap: JSON.parse(row.encoding_map),
            featureImportance: JSON.parse(row.feature_importance)
        };

        try {
            const modelData = JSON.parse(modelArtifact.modelJson);
            const classifier = RFClassifier.load(modelData);
            const inputVector = [preprocessCustomer(customer, modelArtifact)];
            const predictionProbaMatrix = classifier.predictProbability(inputVector, 1);
            const churnProbability = predictionProbaMatrix.get(0, 0) || 0;
            const prediction = churnProbability > 0.5 ? 1 : 0;

            const featureContributions: Record<string, number> = {};
            modelArtifact.features.forEach((f, i) => {
                const importance = modelArtifact.featureImportance?.[f] || 0;
                const value = inputVector[0][i] || 0;
                featureContributions[f] = importance * (value - 0.5) * (prediction === 1 ? 1 : -1);
            });

            return c.json({ success: true, data: { churnProbability, prediction, featureContributions } });
        } catch (e) {
            console.error(e);
            return c.json({ success: false, error: 'Prediction failed' }, 500);
        }
    });

    app.post('/api/batch-predict', async (c) => {
        const auth = await verifyAuth(c);
        if (!auth) return c.json({ success: false, error: 'Unauthorized' }, 401);

        // Simplified batch predict without row limits check for now, can add back later
        const { modelId, customers } = await c.req.json<BatchPredictRequest>();

        const result = await query('SELECT * FROM Models WHERE id = @id', { id: modelId });
        if (result.recordset.length === 0) return c.json({ success: false, error: 'Model not found' }, 404);

        const row = result.recordset[0];
        if (row.org_id !== auth.orgId) return c.json({ success: false, error: 'Forbidden' }, 403);

        const modelArtifact: ModelArtifact = {
            id: row.id,
            orgId: row.org_id,
            name: row.name,
            createdAt: Number(row.created_at),
            targetVariable: row.target_variable,
            features: JSON.parse(row.features),
            performance: JSON.parse(row.performance),
            modelJson: row.model_json,
            encodingMap: JSON.parse(row.encoding_map),
            featureImportance: JSON.parse(row.feature_importance)
        };

        const modelData = JSON.parse(modelArtifact.modelJson);
        const classifier = RFClassifier.load(modelData);
        const inputMatrix = customers.map(customer => preprocessCustomer(customer, modelArtifact));
        const predictionProbaMatrix = classifier.predictProbability(inputMatrix, 1);

        const predictions = customers.map((customer, i) => {
            const churnProbability = predictionProbaMatrix.get(i, 0) || 0;
            const prediction = churnProbability > 0.5 ? 1 : 0;
            const featureContributions: Record<string, number> = {};
            modelArtifact.features.forEach((f, j) => {
                const importance = modelArtifact.featureImportance?.[f] || 0;
                const value = inputMatrix[i][j] || 0;
                featureContributions[f] = importance * (value - 0.5) * (prediction === 1 ? 1 : -1);
            });
            return { churnProbability, prediction, featureContributions };
        });

        return c.json({ success: true, data: { predictions, total: predictions.length } });
    });
}
