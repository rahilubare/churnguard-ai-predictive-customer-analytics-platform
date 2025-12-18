import type { ColumnStat, Dataset } from "@shared/types";

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

        // 4. Data Leakage Suspects (Common in Churn)
        const lowerHeader = header.toLowerCase();
        const leakageKeywords = ["customer_id", "email", "name", "phone", "zip", "postcode", "address"];
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

    // 5. Target Variable Imbalance (Assuming 'churn' or similar as target)
    const targetCandidate = headers.find(h => ["churn", "target", "retained", "exited"].includes(h.toLowerCase()));
    if (targetCandidate) {
        const targetStat = stats[targetCandidate];
        const values = Object.values(targetStat.valueCounts);
        if (values.length === 2) {
            const minVal = Math.min(...values);
            const imbalanceRatio = minVal / rowCount;
            if (imbalanceRatio < 0.1) {
                findings.push({
                    id: "imbalance",
                    column: targetCandidate,
                    type: "warning",
                    title: "Class Imbalance Detected",
                    description: `The minority class in '${targetCandidate}' accounts for only ${(imbalanceRatio * 100).toFixed(1)}% of the data.`,
                    impact: "The model might become biased toward the majority class and fail to catch churners.",
                    recommendation: "Consider oversampling the minority class or using weighted loss.",
                });
            }
        }
    }

    // Calculate summary
    const criticals = findings.filter(f => f.type === "critical").length;
    const warnings = findings.filter(f => f.type === "warning").length;
    const infos = findings.filter(f => f.type === "info").length;

    let score = 100 - (criticals * 20) - (warnings * 10);
    score = Math.max(0, score);

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
