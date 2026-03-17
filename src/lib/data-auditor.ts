import type { ColumnStat, Dataset } from "@shared/types";
import { inferTargetColumn, detectDatasetDomain } from "./data-processor";

export interface AuditFinding {
    id: string;
    column?: string;
    type: "critical" | "warning" | "info";
    title: string;
    description: string;
    impact: string;
    recommendation: string;
}

export interface AuditReport {
    summary: {
        criticalCount: number;
        warningCount: number;
        infoCount: number;
        overallScore: number; // 0-100
    };
    findings: AuditFinding[];
}

export function auditDataset(dataset: Dataset, stats: Record<string, ColumnStat>): AuditReport {
    const findings: AuditFinding[] = [];
    const headers = dataset.headers;
    const rowCount = dataset.rows.length;

    headers.forEach((header) => {
        const stat = stats[header];
        const missingRate = stat.missing / stat.total;

        // 1. Missing Values
        if (missingRate > 0.4) {
            findings.push({
                id: `missing-${header}`,
                column: header,
                type: "critical",
                title: "High Missing Data Rate",
                description: `${(missingRate * 100).toFixed(1)}% of values in '${header}' are missing.`,
                impact: "Reduces model reliability and can lead to biased predictions.",
                recommendation: "Remove this column or investigate data collection issues.",
            });
        } else if (missingRate > 0.1) {
            findings.push({
                id: `missing-${header}`,
                column: header,
                type: "warning",
                title: "Moderate Missing Data",
                description: `${(missingRate * 100).toFixed(1)}% of values in '${header}' are missing.`,
                impact: "Imputation may be required, which adds noise to the model.",
                recommendation: "Ensure missingness is random and not systemic.",
            });
        }

        // 2. Low Variance / Constant Columns
        if (stat.unique === 1 && stat.total > 1) {
            findings.push({
                id: `constant-${header}`,
                column: header,
                type: "critical",
                title: "Constant Value Column",
                description: `Column '${header}' has the same value for all rows.`,
                impact: "Provides zero predictive power and wastes computational resources.",
                recommendation: "Exclude this column from model training.",
            });
        }

        // 3. High Cardinality (Categorical)
        if (stat.type === "categorical" && stat.unique > rowCount * 0.9 && rowCount > 10) {
            findings.push({
                id: `cardinality-${header}`,
                column: header,
                type: "warning",
                title: "High Cardinality / ID Suspect",
                description: `'${header}' has ${stat.unique} unique values in ${rowCount} rows.`,
                impact: "Likely a unique identifier (ID) which will cause overfitting.",
                recommendation: "Exclude IDs and high-cardinality strings from features.",
            });
        }

        // 4. Data Leakage Suspects (Universal - any PII/IDs)
        const lowerHeader = header.toLowerCase();
        const leakageKeywords = ["id", "email", "name", "phone", "zip", "postcode", "address", "ssn", "credit_card", "password", "token"];
        if (leakageKeywords.some(kw => lowerHeader.includes(kw))) {
            findings.push({
                id: `leakage-${header}`,
                column: header,
                type: "info",
                title: "Potential Data Leakage",
                description: `'${header}' appears to contain sensitive or identifying information.`,
                impact: "Identifier columns don't help generalize predictions and should be removed.",
                recommendation: "Verify if this column is an ID or PII and exclude if so.",
            });
        }
    });

    // 5. Duplicate Row Detection
    const rowSignatures = new Set<string>();
    let duplicateCount = 0;
    dataset.rows.forEach(row => {
      const signature = JSON.stringify(Object.values(row).sort());
      if (rowSignatures.has(signature)) {
        duplicateCount++;
      } else {
        rowSignatures.add(signature);
      }
    });
    
    const duplicateRate = duplicateCount / rowCount;
    if (duplicateRate > 0.01) {
      findings.push({
        id: "duplicates",
        type: "warning",
        title: "Duplicate Rows Detected",
        description: `${(duplicateRate * 100).toFixed(1)}% of rows appear to be exact duplicates.`,
        impact: "Duplicates can bias the model and lead to overfitting.",
        recommendation: "Remove duplicate rows before training.",
      });
    }

    // 6. Column Name Quality Check
    headers.forEach(header => {
      const issues: string[] = [];
      
      if (/\s+/.test(header)) issues.push("contains spaces");
      if (/^[0-9]/.test(header)) issues.push("starts with number");
      if (/[^a-zA-Z0-9_\s]/.test(header)) issues.push("contains special characters");
      
      if (issues.length > 0) {
        findings.push({
          id: `column-name-${header}`,
          column: header,
          type: "info",
          title: "Column Name Could Be Improved",
          description: `Column '${header}' ${issues.join(", ")}.`,
          impact: "May cause issues with some ML libraries or make feature importance harder to interpret.",
          recommendation: "Consider renaming to use only letters, numbers, and underscores (e.g., 'customer_id').",
        });
      }
    });

    // Note: Mixed type detection would require extending ColumnStat type
    // For now, the data processor handles this during parsing

    // 8. Domain-Aware Target Analysis
    const targetCandidate = inferTargetColumn(dataset);
    const domainInfo = detectDatasetDomain(dataset);
    
    if (targetCandidate) {
      const targetStat = stats[targetCandidate];
      const values = Object.values(targetStat.valueCounts);
      
      if (values.length === 2) {
        const minVal = Math.min(...values);
        const imbalanceRatio = minVal / rowCount;
        
        if (imbalanceRatio < 0.15) {
          // Domain-specific messaging
          let targetLabel = "the target variable";
          let contextMsg = "";
          
          if (domainInfo.domain.includes("HR")) {
            targetLabel = "employee attrition";
            contextMsg = " in your workforce";
          } else if (domainInfo.domain.includes("Fraud")) {
            targetLabel = "fraudulent transactions";
            contextMsg = " in your transaction data";
          } else if (domainInfo.domain.includes("Healthcare")) {
            targetLabel = "patient outcomes";
            contextMsg = " in your patient data";
          } else if (domainInfo.domain.includes("Student")) {
            targetLabel = "student dropout";
            contextMsg = " rates";
          } else if (domainInfo.domain.includes("Churn")) {
            targetLabel = "customer churn";
            contextMsg = "";
          }
          
          const severity = imbalanceRatio < 0.05 ? "critical" : "warning";
          findings.push({
            id: "imbalance",
            column: targetCandidate,
            type: severity,
            title: `Class Imbalance in ${targetLabel}`,
            description: `The minority class (${targetLabel}) accounts for only ${(imbalanceRatio * 100).toFixed(1)}%${contextMsg}.`,
            impact: "The model might become biased toward the majority class and fail to detect rare events.",
            recommendation: "Consider oversampling the minority class, using weighted loss, or collecting more balanced data.",
          });
        }
      } else if (values.length > 2) {
        findings.push({
          id: "multi-class-target",
          column: targetCandidate,
          type: "info",
          title: "Multi-Class Target Detected",
          description: `The target column '${targetCandidate}' has ${values.length} unique values. This requires multi-class classification.`,
          impact: "Random Forest and GBDT can handle multi-class problems, but accuracy may be lower than binary classification.",
          recommendation: "Verify this is the correct target column, or consider converting to binary if appropriate for your use case.",
        });
      }
    } else {
      findings.push({
        id: "no-target",
        type: "info",
        title: "No Clear Target Variable",
        description: "Could not automatically identify a binary target variable for classification.",
        impact: "You'll need to manually select which column to predict.",
        recommendation: "Look for columns with exactly 2 unique values (0/1, Yes/No, True/False) that represent the outcome you want to predict.",
      });
    }

    // Calculate summary with improved scoring
    const criticals = findings.filter(f => f.type === "critical").length;
    const warnings = findings.filter(f => f.type === "warning").length;
    const infos = findings.filter(f => f.type === "info").length;

    // Nuanced scoring algorithm
    let score = 100;
    score -= criticals * 25;  // Critical issues are severe
    score -= warnings * 10;   // Warnings matter
    score -= infos * 3;       // Info findings have minor impact
    
    // Bonus for sufficient data
    if (rowCount > 1000) {
      score += 5;
    }
    
    // Bonus for clean binary target
    if (targetCandidate) {
      const targetStat = stats[targetCandidate];
      const hasOnlyTwoClasses = Object.keys(targetStat.valueCounts).length === 2;
      const noMissingInTarget = targetStat.missing === 0;
      
      if (hasOnlyTwoClasses && noMissingInTarget) {
        score += 5;
      }
    }
    
    // Floor at 0, ceiling at 100
    score = Math.max(0, Math.min(100, score));

    return {
        summary: {
            criticalCount: criticals,
            warningCount: warnings,
            infoCount: infos,
            overallScore: score,
        },
        findings,
    };
}
