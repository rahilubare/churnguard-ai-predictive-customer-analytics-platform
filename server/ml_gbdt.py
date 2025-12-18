import sys
import json
import numpy as np
from sklearn.ensemble import GradientBoostingClassifier
import pickle
import base64

def train(data):
    X = np.array(data['X'])
    y = np.array(data['y'])
    
    model = GradientBoostingClassifier(
        n_estimators=100,
        learning_rate=0.1,
        max_depth=3,
        random_state=42
    )
    model.fit(X, y)
    
    # Calculate feature importances
    importances = model.feature_importances_.tolist()
    
    # Serialize model to a string for Node.js storage
    model_bytes = pickle.dumps(model)
    model_b64 = base64.b64encode(model_bytes).decode('utf-8')
    
    return {
        'model_json': model_b64,
        'feature_importances': importances,
        'metrics': {
            'accuracy': float(model.score(X, y)),
            # In a real scenario, we'd use a split, but for this demoFit we reuse X
        }
    }

def predict(data):
    model_b64 = data['model_json']
    X = np.array(data['X'])
    
    model_bytes = base64.b64decode(model_b64)
    model = pickle.loads(model_bytes)
    
    probabilities = model.predict_proba(X)
    # Return probabilities for the positive class (churn)
    return {
        'probabilities': probabilities[:, 1].tolist()
    }

if __name__ == "__main__":
    try:
        input_data = json.load(sys.stdin)
        command = input_data.get('command')
        payload = input_data.get('payload')
        
        if command == 'train':
            result = train(payload)
            print(json.dumps({'success': True, 'data': result}))
        elif command == 'predict':
            result = predict(payload)
            print(json.dumps({'success': True, 'data': result}))
        else:
            print(json.dumps({'success': False, 'error': 'Unknown command'}))
            
    except Exception as e:
        print(json.dumps({'success': False, 'error': str(e)}))
