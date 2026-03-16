import { Hono } from "hono";
import { query } from "./db";
import { v4 as uuidv4 } from 'uuid';
import { RandomForestClassifier as RFClassifier } from 'ml-random-forest';
import { GBDTClassifier } from "../shared/gbdt";
import type { ModelArtifact, PredictionResult, BatchPredictRequest, PredictionBatchResult, AuthResponse, Role, ModelComparison } from "@shared/types";
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { compareModels, validateModelArtifact } from '../src/lib/model-validator';

// --- AUTH UTILITIES ---
async function hashPassword(password: string, salt: string): Promise<string> {
    const hash = crypto.createHash('sha256').update(password + salt).digest('hex');
    return hash;
}

async function verifyAuth(c: any): Promise<{ userId: string, orgId: string } | null> {
    try {
        const authHeader = c.req.header('Authorization');
        if (!authHeader) return null;
        
        const token = authHeader.replace('Bearer ', '').trim();
        if (!token || token.length === 0) return null;

        const result = await query('SELECT user_id, org_id, exp FROM Sessions WHERE id = @token', { token });
        if (result.recordset.length === 0) return null;

        const session = result.recordset[0];
        if (Date.now() > Number(session.exp)) {
            await query('DELETE FROM Sessions WHERE id = @token', { token });
            return null;
        }
        return { userId: session.user_id, orgId: session.org_id };
    } catch (e) {
        console.error('Auth verification failed:', e instanceof Error ? e.message : 'Unknown error');
        return null;
    }
}

// --- INPUT VALIDATION ---
function validateRequired(value: unknown, fieldName: string): string {
    if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
        throw new Error(`${fieldName} is required`);
    }
    return String(value);
}

function validateEmail(email: string): string {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        throw new Error('Invalid email format');
    }
    return email.toLowerCase();
}

function validatePassword(password: string): void {
    if (password.length < 8) {
        throw new Error('Password must be at least 8 characters');
    }
    if (!/[a-zA-Z]/.test(password)) {
        throw new Error('Password must contain at least one letter');
    }
    if (!/[0-9]/.test(password)) {
        throw new Error('Password must contain at least one number');
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

// --- PYTHON BRIDGE ---
async function runPythonScript(command: string, payload: any): Promise<any> {
    return new Promise((resolve, reject) => {
        const pythonPath = 'python'; // Or absolute path if needed
        const scriptPath = path.join(process.cwd(), 'server', 'ml_gbdt.py');

        const py = spawn(pythonPath, [scriptPath]);
        let output = '';
        let errorOutput = '';

        py.stdout.on('data', (data) => {
            output += data.toString();
        });

        py.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });

        py.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(`Python process exited with code ${code}: ${errorOutput}`));
                return;
            }
            try {
                const result = JSON.parse(output);
                if (result.success) {
                    resolve(result.data);
                } else {
                    reject(new Error(result.error || 'Unknown Python error'));
                }
            } catch (e) {
                reject(new Error(`Failed to parse Python output: ${output}`));
            }
        });

        py.stdin.write(JSON.stringify({ command, payload }));
        py.stdin.end();
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
            featureImportance: JSON.parse(row.feature_importance),
            algorithm: row.algorithm || 'random_forest'
        }));

        return c.json({ success: true, data: { items, next: null } });
    });

    app.post('/api/models', async (c) => {
        const auth = await verifyAuth(c);
        if (!auth) return c.json({ success: false, error: 'Unauthorized' }, 401);

        try {
            const body = await c.req.json<Partial<ModelArtifact>>();
            
            // Validate required fields
            if (!body.name || typeof body.name !== 'string' || body.name.trim() === '') {
                return c.json({ success: false, error: 'Model name is required' }, 400);
            }
            if (!body.modelJson || typeof body.modelJson !== 'string') {
                return c.json({ success: false, error: 'Model JSON is required' }, 400);
            }

            // Validate model JSON is parseable
            try {
                JSON.parse(body.modelJson);
            } catch {
                return c.json({ success: false, error: 'Invalid model JSON format' }, 400);
            }

            const newModel: ModelArtifact = {
                id: uuidv4(),
                orgId: auth.orgId,
                name: body.name.trim(),
                createdAt: Date.now(),
                targetVariable: body.targetVariable || 'unknown',
                features: Array.isArray(body.features) ? body.features : [],
                performance: body.performance || { accuracy: 0, precision: 0, recall: 0, f1: 0, rocAuc: 0, confusionMatrix: { truePositive: 0, trueNegative: 0, falsePositive: 0, falseNegative: 0 } },
                modelJson: body.modelJson,
                encodingMap: body.encodingMap || {},
                featureImportance: body.featureImportance || {},
                algorithm: body.algorithm || 'random_forest',
            };

            await query(`INSERT INTO Models (id, org_id, name, created_at, target_variable, features, performance, encoding_map, feature_importance, model_json, algorithm)
         VALUES (@id, @orgId, @name, @createdAt, @targetVariable, @features, @performance, @encodingMap, @featureImportance, @modelJson, @algorithm)`, {
                id: newModel.id,
                orgId: newModel.orgId,
                name: newModel.name,
                createdAt: newModel.createdAt,
                targetVariable: newModel.targetVariable,
                features: JSON.stringify(newModel.features),
                performance: JSON.stringify(newModel.performance),
                encodingMap: JSON.stringify(newModel.encodingMap),
                featureImportance: JSON.stringify(newModel.featureImportance),
                modelJson: newModel.modelJson,
                algorithm: newModel.algorithm
            });

            return c.json({ success: true, data: newModel });
        } catch (error) {
            console.error('Error creating model:', error);
            return c.json({ success: false, error: 'Failed to create model' }, 500);
        }
    });

    // --- DELETE MODEL ---
    app.delete('/api/models/:id', async (c) => {
        const auth = await verifyAuth(c);
        if (!auth) return c.json({ success: false, error: 'Unauthorized' }, 401);

        try {
            const { id } = c.req.param();
            
            if (!id || typeof id !== 'string') {
                return c.json({ success: false, error: 'Model ID is required' }, 400);
            }

            // Check if model exists and belongs to user's org
            const result = await query('SELECT org_id FROM Models WHERE id = @id', { id });
            if (result.recordset.length === 0) {
                return c.json({ success: false, error: 'Model not found' }, 404);
            }

            if (result.recordset[0].org_id !== auth.orgId) {
                return c.json({ success: false, error: 'Forbidden' }, 403);
            }

            // Delete the model
            await query('DELETE FROM Models WHERE id = @id', { id });

            return c.json({ success: true, data: { message: 'Model deleted successfully' } });
        } catch (error) {
            console.error('Error deleting model:', error);
            return c.json({ success: false, error: 'Failed to delete model' }, 500);
        }
    });

    // --- COMPARE MODELS ---
    app.post('/api/models/compare', async (c) => {
        const auth = await verifyAuth(c);
        if (!auth) return c.json({ success: false, error: 'Unauthorized' }, 401);

        try {
            const { modelAId, modelBId } = await c.req.json<{ modelAId: string; modelBId: string }>();
            
            if (!modelAId || !modelBId) {
                return c.json({ success: false, error: 'Both model IDs are required' }, 400);
            }

            if (modelAId === modelBId) {
                return c.json({ success: false, error: 'Cannot compare a model with itself' }, 400);
            }

            // Fetch both models
            const resultA = await query('SELECT * FROM Models WHERE id = @id', { id: modelAId });
            const resultB = await query('SELECT * FROM Models WHERE id = @id', { id: modelBId });

            if (resultA.recordset.length === 0 || resultB.recordset.length === 0) {
                return c.json({ success: false, error: 'One or both models not found' }, 404);
            }

            // Verify both belong to user's org
            if (resultA.recordset[0].org_id !== auth.orgId || resultB.recordset[0].org_id !== auth.orgId) {
                return c.json({ success: false, error: 'Forbidden' }, 403);
            }

            const modelA: ModelArtifact = {
                ...resultA.recordset[0],
                features: JSON.parse(resultA.recordset[0].features),
                performance: JSON.parse(resultA.recordset[0].performance),
                encodingMap: JSON.parse(resultA.recordset[0].encoding_map),
                featureImportance: JSON.parse(resultA.recordset[0].feature_importance),
            };

            const modelB: ModelArtifact = {
                ...resultB.recordset[0],
                features: JSON.parse(resultB.recordset[0].features),
                performance: JSON.parse(resultB.recordset[0].performance),
                encodingMap: JSON.parse(resultB.recordset[0].encoding_map),
                featureImportance: JSON.parse(resultB.recordset[0].feature_importance),
            };

            const comparison = compareModels(modelA, modelB);

            return c.json({ success: true, data: { modelA, modelB, comparison } });
        } catch (error) {
            console.error('Error comparing models:', error);
            return c.json({ success: false, error: 'Failed to compare models' }, 500);
        }
    });

    // --- NEW: SERVER-SIDE TRAINING (FOR PYTHON) ---
    app.post('/api/models/train', async (c) => {
        const auth = await verifyAuth(c);
        if (!auth) return c.json({ success: false, error: 'Unauthorized' }, 401);

        const { name, dataset, targetVariable, features, algorithm } = await c.req.json<{
            name: string;
            dataset: { X: number[][], y: number[] };
            targetVariable: string;
            features: string[];
            algorithm: string;
        }>();

        if (algorithm !== 'python_gbdt') {
            return c.json({ success: false, error: 'Only python_gbdt is supported for server-side training' }, 400);
        }

        try {
            const result = await runPythonScript('train', { X: dataset.X, y: dataset.y });

            const newModel: ModelArtifact = {
                id: uuidv4(),
                orgId: auth.orgId,
                name,
                createdAt: Date.now(),
                targetVariable,
                features,
                performance: {
                    accuracy: result.metrics.accuracy,
                    precision: result.metrics.accuracy,
                    recall: result.metrics.accuracy,
                    f1: result.metrics.accuracy,
                    rocAuc: result.metrics.accuracy,
                    confusionMatrix: { truePositive: 0, trueNegative: 0, falsePositive: 0, falseNegative: 0 }
                },
                modelJson: result.model_json,
                encodingMap: {},
                featureImportance: features.reduce((acc, f, i) => {
                    acc[f] = result.feature_importances[i];
                    return acc;
                }, {} as Record<string, number>),
                algorithm: 'python_gbdt'
            };

            await query(`INSERT INTO Models (id, org_id, name, created_at, target_variable, features, performance, encoding_map, feature_importance, model_json, algorithm)
         VALUES (@id, @orgId, @name, @createdAt, @targetVariable, @features, @performance, @encodingMap, @featureImportance, @modelJson, @algorithm)`, {
                id: newModel.id,
                orgId: newModel.orgId,
                name: newModel.name,
                createdAt: newModel.createdAt,
                targetVariable: newModel.targetVariable,
                features: JSON.stringify(newModel.features),
                performance: JSON.stringify(newModel.performance),
                encodingMap: JSON.stringify(newModel.encodingMap),
                featureImportance: JSON.stringify(newModel.featureImportance),
                modelJson: newModel.modelJson,
                algorithm: newModel.algorithm
            });

            return c.json({ success: true, data: newModel });
        } catch (e: any) {
            console.error(e);
            return c.json({ success: false, error: e.message || 'Python training failed' }, 500);
        }
    });

    // --- PREDICT ---
    app.post('/api/predict', async (c) => {
        const auth = await verifyAuth(c);
        if (!auth) return c.json({ success: false, error: 'Unauthorized' }, 401);

        try {
            const body = await c.req.json<{ modelId?: string; customer?: Record<string, any> }>();
            
            // Validate inputs
            if (!body.modelId || typeof body.modelId !== 'string') {
                return c.json({ success: false, error: 'Model ID is required' }, 400);
            }
            if (!body.customer || typeof body.customer !== 'object') {
                return c.json({ success: false, error: 'Customer data is required' }, 400);
            }

            const { modelId, customer } = body;

            const result = await query('SELECT * FROM Models WHERE id = @id', { id: modelId });
            if (result.recordset.length === 0) {
                return c.json({ success: false, error: 'Model not found' }, 404);
            }

            const row = result.recordset[0];
            if (row.org_id !== auth.orgId) {
                return c.json({ success: false, error: 'Forbidden' }, 403);
            }

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
                featureImportance: JSON.parse(row.feature_importance),
                algorithm: row.algorithm || 'random_forest'
            };

            const inputVector = [preprocessCustomer(customer, modelArtifact)];

            let churnProbability = 0;
            if (modelArtifact.algorithm === 'python_gbdt') {
                const pyResult = await runPythonScript('predict', {
                    model_json: modelArtifact.modelJson,
                    X: inputVector
                });
                churnProbability = pyResult.probabilities[0];
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

            return c.json({ success: true, data: { churnProbability, prediction, featureContributions } });
        } catch (e) {
            console.error('Prediction error:', e);
            return c.json({ 
                success: false, 
                error: e instanceof Error ? e.message : 'Prediction failed' 
            }, 500);
        }
    });

    app.post('/api/batch-predict', async (c) => {
        const auth = await verifyAuth(c);
        if (!auth) return c.json({ success: false, error: 'Unauthorized' }, 401);

        try {
            const body = await c.req.json<BatchPredictRequest>();
            
            // Validate inputs
            if (!body.modelId || typeof body.modelId !== 'string') {
                return c.json({ success: false, error: 'Model ID is required' }, 400);
            }
            if (!Array.isArray(body.customers) || body.customers.length === 0) {
                return c.json({ success: false, error: 'Customers array is required and must not be empty' }, 400);
            }
            
            // Limit batch size
            if (body.customers.length > 10000) {
                return c.json({ success: false, error: 'Batch size exceeds maximum of 10,000 customers' }, 400);
            }

            const { modelId, customers } = body;

            const result = await query('SELECT * FROM Models WHERE id = @id', { id: modelId });
            if (result.recordset.length === 0) {
                return c.json({ success: false, error: 'Model not found' }, 404);
            }

            const row = result.recordset[0];
            if (row.org_id !== auth.orgId) {
                return c.json({ success: false, error: 'Forbidden' }, 403);
            }

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
                featureImportance: JSON.parse(row.feature_importance),
                algorithm: row.algorithm || 'random_forest'
            };

            const inputMatrix = customers.map(customer => preprocessCustomer(customer, modelArtifact));

            let probabilities: number[] = [];
            if (modelArtifact.algorithm === 'python_gbdt') {
                const pyResult = await runPythonScript('predict', {
                    model_json: modelArtifact.modelJson,
                    X: inputMatrix
                });
                probabilities = pyResult.probabilities;
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

            return c.json({ success: true, data: { predictions, total: predictions.length } });
        } catch (e) {
            console.error('Batch prediction error:', e);
            return c.json({ 
                success: false, 
                error: e instanceof Error ? e.message : 'Batch prediction failed' 
            }, 500);
        }
    });
}
