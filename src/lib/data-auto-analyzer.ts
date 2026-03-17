import type { Dataset, ColumnStat } from "@shared/types";

export interface AutoAnalysisResult {
  suggestedTarget: string | null;
  suggestedFeatures: string[];
  confidence: number; // 0-1
  reasoning: string;
  dataQuality: {
    rowCount: number;
    featureCount: number;
    hasBinaryTarget: boolean;
    classDistribution?: { class0: number; class1: number };
    issues: string[];
  };
}

/**
 * Automatically analyzes any dataset to find the best target variable and features
 */
export function autoAnalyzeDataset(dataset: Dataset, stats: Record<string, ColumnStat>): AutoAnalysisResult {
  const headers = dataset.headers;
  const rows = dataset.rows;
  const issues: string[] = [];
  
  // Step 1: Find potential binary target variables (churn-like columns)
  const binaryCandidates: { name: string; quality: number; distribution: { class0: number; class1: number } }[] = [];
  
  headers.forEach(header => {
    const stat = stats[header];
    if (!stat) return;
    
    const lowerHeader = header.toLowerCase();
    
    // Check if column is binary (2 unique values)
    if (stat.unique === 2 && stat.type !== 'continuous') {
      // Get the two unique values
      const values = Array.from(stat.uniqueValues || []);
      
      // Check if values are 0/1, Yes/No, True/False, Churn/Not Churn, etc.
      const isChurnLike = 
        lowerHeader.includes('churn') || 
        lowerHeader.includes('exit') || 
        lowerHeader.includes('attrition') ||
        lowerHeader.includes('target') ||
        lowerHeader.includes('label') ||
        lowerHeader.includes('response');
      
      const isBinaryEncoding = 
        (values.includes(0) && values.includes(1)) ||
        (values.includes('0') && values.includes('1')) ||
        (values.some(v => String(v).toLowerCase() === 'yes') && values.some(v => String(v).toLowerCase() === 'no')) ||
        (values.some(v => String(v).toLowerCase() === 'true') && values.some(v => String(v).toLowerCase() === 'false')) ||
        (values.some(v => String(v).toLowerCase() === 'churn') && values.some(v => String(v).toLowerCase() === 'stay'));
      
      if (isBinaryEncoding) {
        // Calculate class distribution
        let count0 = 0;
        let count1 = 0;
        
        rows.forEach(row => {
          const val = row[header];
          const normalized = String(val).toLowerCase();
          
          if (val === 0 || val === '0' || normalized === 'no' || normalized === 'false' || normalized === 'stay') {
            count0++;
          } else if (val === 1 || val === '1' || normalized === 'yes' || normalized === 'true' || normalized === 'churn' || normalized === 'exit') {
            count1++;
          }
        });
        
        const total = count0 + count1;
        const balance = Math.min(count0, count1) / Math.max(count0, count1); // 1.0 = perfectly balanced
        
        binaryCandidates.push({
          name: header,
          quality: isChurnLike ? 1.0 : 0.7 + (balance * 0.3),
          distribution: { class0: count0, class1: count1 }
        });
      }
    }
  });
  
  // Step 2: If no perfect match found, look for any binary column with good balance
  if (binaryCandidates.length === 0) {
    headers.forEach(header => {
      const stat = stats[header];
      if (!stat || stat.unique !== 2) return;
      
      const values = Array.from(stat.uniqueValues || []);
      let count0 = 0;
      let count1 = 0;
      
      rows.forEach(row => {
        const val = row[header];
        if ([0, '0', false, 'false', 'no'].includes(val)) count0++;
        else if ([1, '1', true, 'true', 'yes'].includes(val as any)) count1++;
      });
      
      if (count0 > 0 && count1 > 0) {
        const balance = Math.min(count0, count1) / Math.max(count0, count1);
        if (balance > 0.1) { // At least 10% minority class
          binaryCandidates.push({
            name: header,
            quality: 0.5 + (balance * 0.5),
            distribution: { class0: count0, class1: count1 }
          });
        }
      }
    });
  }
  
  // Step 3: Select best target
  binaryCandidates.sort((a, b) => b.quality - a.quality);
  const bestTarget = binaryCandidates[0] || null;
  
  // Step 4: Identify good feature candidates (exclude targets, IDs, and PII)
  const suggestedFeatures: string[] = [];
  const excludePatterns = ['customer_id', 'id', 'email', 'phone', 'name', 'ssn', 'credit_card', 'password'];
  
  headers.forEach(header => {
    const lowerHeader = header.toLowerCase();
    const stat = stats[header];
    
    // Skip if it's the target
    if (bestTarget && header === bestTarget.name) return;
    
    // Skip obvious IDs and PII
    if (excludePatterns.some(pattern => lowerHeader.includes(pattern))) {
      issues.push(`Excluded '${header}' - appears to be an ID or PII`);
      return;
    }
    
    // Skip if constant (only 1 unique value)
    if (stat && stat.unique === 1) {
      issues.push(`Excluded '${header}' - constant value (no variance)`);
      return;
    }
    
    // Skip if too high cardinality (likely an ID)
    if (stat && stat.type === 'categorical' && stat.unique > rows.length * 0.8) {
      issues.push(`Excluded '${header}' - too many unique values (likely an ID)`);
      return;
    }
    
    suggestedFeatures.push(header);
  });
  
  // Step 5: Calculate overall confidence
  let confidence = 0;
  let reasoning = '';
  
  if (!bestTarget) {
    confidence = 0.2;
    reasoning = 'No clear binary target variable found. Please manually select a target column with two classes (e.g., 0/1, Yes/No, Churn/Stay).';
    issues.push('No suitable target variable detected');
  } else if (bestTarget.quality >= 0.9) {
    confidence = 0.95;
    reasoning = `High confidence: '${bestTarget.name}' appears to be a churn/target variable with ${bestTarget.distribution.class0} negative and ${bestTarget.distribution.class1} positive samples.`;
  } else if (bestTarget.quality >= 0.7) {
    confidence = 0.75;
    reasoning = `Moderate confidence: '${bestTarget.name}' is a binary variable but may not represent churn. Class distribution: ${bestTarget.distribution.class0}/${bestTarget.distribution.class1}.`;
  } else {
    confidence = 0.5;
    reasoning = `Low confidence: '${bestTarget.name}' is binary but may not be ideal for churn prediction. Consider manual selection.`;
  }
  
  // Validate minimum requirements
  if (rows.length < 50) {
    confidence *= 0.7;
    issues.push(`Very small dataset (${rows.length} rows). Recommend at least 100+ rows for reliable training.`);
  }
  
  if (suggestedFeatures.length < 2) {
    confidence *= 0.6;
    issues.push(`Insufficient features (${suggestedFeatures.length}). Need at least 2-3 features for meaningful prediction.`);
  }
  
  const classBalance = bestTarget ? 
    Math.min(bestTarget.distribution.class0, bestTarget.distribution.class1) / 
    Math.max(bestTarget.distribution.class0, bestTarget.distribution.class1) : 0;
  
  if (classBalance < 0.2) {
    confidence *= 0.8;
    issues.push(`Severe class imbalance detected. Only ${(classBalance * 100).toFixed(1)}% minority class.`);
  }
  
  return {
    suggestedTarget: bestTarget?.name || null,
    suggestedFeatures,
    confidence: Math.round(confidence * 100) / 100,
    reasoning,
    dataQuality: {
      rowCount: rows.length,
      featureCount: suggestedFeatures.length,
      hasBinaryTarget: !!bestTarget,
      classDistribution: bestTarget?.distribution,
      issues
    }
  };
}
