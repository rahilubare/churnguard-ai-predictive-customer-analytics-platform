import { detectDatasetDomain } from './data-processor';
import type { Dataset } from '@shared/types';

/**
 * Domain-aware terminology management
 * Replaces hardcoded "churn" language with dynamic terms based on detected dataset domain
 */

export interface DomainTerminology {
  domainName: string;
  targetLabel: string;
  predictionLabel: string;
  modelType: string;
  positiveOutcome: string;
  negativeOutcome: string;
  contextPhrase: string;
}

/**
 * Get domain-appropriate terminology for UI labels and messages
 */
export function getDomainTerminology(dataset: Dataset | null): DomainTerminology {
  if (!dataset) {
    // Default/generic terminology when no data is loaded
    return {
      domainName: 'Classification',
      targetLabel: 'Target Variable',
      predictionLabel: 'Prediction',
      modelType: 'Binary Classification Model',
      positiveOutcome: 'Positive Class',
      negativeOutcome: 'Negative Class',
      contextPhrase: '',
    };
  }

  const domainInfo = detectDatasetDomain(dataset);
  const domain = domainInfo.domain.toLowerCase();

  // HR Attrition
  if (domain.includes('hr') || domain.includes('attrition')) {
    return {
      domainName: 'HR Attrition',
      targetLabel: 'Employee Attrition',
      predictionLabel: 'Attrition Prediction',
      modelType: 'Employee Attrition Prediction Model',
      positiveOutcome: 'Left Company',
      negativeOutcome: 'Stayed',
      contextPhrase: ' in your workforce',
    };
  }

  // Financial Fraud
  if (domain.includes('fraud') || domain.includes('financial')) {
    return {
      domainName: 'Financial Fraud Detection',
      targetLabel: 'Fraud Detection',
      predictionLabel: 'Fraud Prediction',
      modelType: 'Fraud Detection Model',
      positiveOutcome: 'Fraudulent',
      negativeOutcome: 'Legitimate',
      contextPhrase: ' in your transaction data',
    };
  }

  // Healthcare
  if (domain.includes('healthcare') || domain.includes('medical') || domain.includes('patient')) {
    return {
      domainName: 'Healthcare Analytics',
      targetLabel: 'Patient Outcome',
      predictionLabel: 'Outcome Prediction',
      modelType: 'Patient Outcome Prediction Model',
      positiveOutcome: 'Positive Outcome',
      negativeOutcome: 'Negative Outcome',
      contextPhrase: ' in your patient data',
    };
  }

  // Sales/Marketing
  if (domain.includes('sales') || domain.includes('marketing') || domain.includes('conversion')) {
    return {
      domainName: 'Sales & Marketing',
      targetLabel: 'Conversion',
      predictionLabel: 'Conversion Prediction',
      modelType: 'Conversion Prediction Model',
      positiveOutcome: 'Converted',
      negativeOutcome: 'Did Not Convert',
      contextPhrase: ' in your sales funnel',
    };
  }

  // Student Dropout
  if (domain.includes('student') || domain.includes('dropout') || domain.includes('education')) {
    return {
      domainName: 'Education Analytics',
      targetLabel: 'Student Dropout',
      predictionLabel: 'Dropout Prediction',
      modelType: 'Student Dropout Prediction Model',
      positiveOutcome: 'Dropped Out',
      negativeOutcome: 'Graduated/Continued',
      contextPhrase: ' rates',
    };
  }

  // Equipment/IoT
  if (domain.includes('equipment') || domain.includes('iot') || domain.includes('failure')) {
    return {
      domainName: 'Predictive Maintenance',
      targetLabel: 'Equipment Failure',
      predictionLabel: 'Failure Prediction',
      modelType: 'Equipment Failure Prediction Model',
      positiveOutcome: 'Failed',
      negativeOutcome: 'Operating Normally',
      contextPhrase: ' in your equipment data',
    };
  }

  // Customer Churn (original domain)
  if (domain.includes('churn') || domain.includes('customer')) {
    return {
      domainName: 'Customer Churn Analysis',
      targetLabel: 'Customer Churn',
      predictionLabel: 'Churn Prediction',
      modelType: 'Customer Churn Prediction Model',
      positiveOutcome: 'Churned',
      negativeOutcome: 'Retained',
      contextPhrase: '',
    };
  }

  // Generic/Fallback
  return {
    domainName: domainInfo.domain,
    targetLabel: 'Target Variable',
    predictionLabel: 'Prediction',
    modelType: 'Binary Classification Model',
    positiveOutcome: 'Positive Class',
    negativeOutcome: 'Negative Class',
    contextPhrase: '',
  };
}

/**
 * Format probability label based on domain
 * e.g., "Churn Probability" → "Attrition Probability" → "Fraud Probability"
 */
export function formatProbabilityLabel(dataset: Dataset | null, defaultLabel: string = 'Probability'): string {
  const terminology = getDomainTerminology(dataset);
  
  // Extract the key concept from domain name
  const concepts: Record<string, string> = {
    'hr attrition': 'Attrition',
    'financial fraud detection': 'Fraud',
    'healthcare analytics': 'Outcome',
    'sales & marketing': 'Conversion',
    'education analytics': 'Dropout',
    'predictive maintenance': 'Failure',
    'customer churn analysis': 'Churn',
  };

  const domainKey = terminology.domainName.toLowerCase();
  const concept = concepts[domainKey] || terminology.targetLabel.split(' ')[0];
  
  return `${concept} ${defaultLabel}`;
}

/**
 * Format risk level description based on domain
 */
export function formatRiskDescription(dataset: Dataset | null, riskLevel: 'high' | 'medium' | 'low'): string {
  const terminology = getDomainTerminology(dataset);
  
  const riskDescriptions: Record<string, Record<typeof riskLevel, string>> = {
    'default': {
      high: 'High Risk',
      medium: 'Medium Risk',
      low: 'Low Risk',
    },
    'hr attrition': {
      high: 'High Flight Risk',
      medium: 'Moderate Flight Risk',
      low: 'Low Flight Risk',
    },
    'financial fraud detection': {
      high: 'High Fraud Risk',
      medium: 'Moderate Fraud Risk',
      low: 'Low Fraud Risk',
    },
    'healthcare analytics': {
      high: 'Critical Condition',
      medium: 'Moderate Risk',
      low: 'Low Risk',
    },
    'predictive maintenance': {
      high: 'Imminent Failure',
      medium: 'Elevated Risk',
      low: 'Normal Operation',
    },
  };

  const domainKey = terminology.domainName.toLowerCase();
  const matchingKey = Object.keys(riskDescriptions).find(key => domainKey.includes(key)) || 'default';
  
  return riskDescriptions[matchingKey as keyof typeof riskDescriptions][riskLevel];
}
