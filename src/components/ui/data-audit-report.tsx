import React from "react";
import {
    AlertCircle,
    AlertTriangle,
    CheckCircle2,
    Info,
    ShieldCheck,
    ArrowRight,
    ChevronDown,
    ChevronUp
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./card";
import { Badge } from "./badge";
import { Button } from "./button";
import { Progress } from "./progress";
import { cn } from "@/lib/utils";
import { AuditReport, AuditFinding } from "@/lib/data-auditor";

interface DataAuditReportProps {
    report: AuditReport;
}

export function DataAuditReport({ report }: DataAuditReportProps) {
    const [isExpanded, setIsExpanded] = React.useState(true);

    const getSeverityColor = (type: AuditFinding["type"]) => {
        switch (type) {
            case "critical": return "text-destructive border-destructive bg-destructive/10";
            case "warning": return "text-orange-500 border-orange-500 bg-orange-500/10";
            case "info": return "text-blue-500 border-blue-500 bg-blue-500/10";
            default: return "";
        }
    };

    const getSeverityIcon = (type: AuditFinding["type"]) => {
        switch (type) {
            case "critical": return <AlertCircle className="h-5 w-5" />;
            case "warning": return <AlertTriangle className="h-5 w-5" />;
            case "info": return <Info className="h-5 w-5" />;
            default: return null;
        }
    };

    const scoreColor = report.summary.overallScore > 80
        ? "text-emerald-500"
        : report.summary.overallScore > 50
            ? "text-orange-500"
            : "text-destructive";

    return (
        <Card className="overflow-hidden border-2 shadow-premium">
            <CardHeader className="bg-muted/50 pb-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <ShieldCheck className="h-6 w-6 text-emerald-500" />
                        <CardTitle>Data Quality Audit Report</CardTitle>
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsExpanded(!isExpanded)}
                    >
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                </div>
                <CardDescription>
                    Automated assessment of your dataset for churn prediction readiness.
                </CardDescription>
            </CardHeader>

            {isExpanded && (
                <CardContent className="pt-6 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                        <div className="flex flex-col items-center justify-center p-4 bg-background rounded-xl border-2 border-dashed">
                            <span className="text-sm font-medium text-muted-foreground mb-2">Quality Score</span>
                            <div className={cn("text-4xl font-bold mb-2", scoreColor)}>
                                {report.summary.overallScore}%
                            </div>
                            <Progress value={report.summary.overallScore} className="h-2 w-full max-w-[100px]" />
                        </div>

                        <div className="md:col-span-3 grid grid-cols-3 gap-4">
                            <div className="p-4 rounded-xl bg-destructive/5 border border-destructive/20 flex flex-col items-center">
                                <span className="text-2xl font-bold text-destructive">{report.summary.criticalCount}</span>
                                <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Critical Issues</span>
                            </div>
                            <div className="p-4 rounded-xl bg-orange-500/5 border border-orange-500/20 flex flex-col items-center">
                                <span className="text-2xl font-bold text-orange-500">{report.summary.warningCount}</span>
                                <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Warnings</span>
                            </div>
                            <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/20 flex flex-col items-center">
                                <span className="text-2xl font-bold text-blue-500">{report.summary.infoCount}</span>
                                <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Observations</span>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h4 className="text-sm font-semibold flex items-center gap-2">
                            <ArrowRight className="h-4 w-4 text-primary" /> Key Findings & Recommendations
                        </h4>

                        {report.findings.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
                                <CheckCircle2 className="h-10 w-10 text-emerald-500 mb-2" />
                                <p>No issues detected. Your data is ready for training!</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {report.findings.map((finding) => (
                                    <div
                                        key={finding.id}
                                        className="p-4 rounded-xl border bg-card hover:shadow-md transition-shadow duration-200"
                                    >
                                        <div className="flex items-start gap-4">
                                            <div className={cn("p-2 rounded-lg", getSeverityColor(finding.type))}>
                                                {getSeverityIcon(finding.type)}
                                            </div>
                                            <div className="flex-grow space-y-1">
                                                <div className="flex items-center justify-between">
                                                    <span className="font-bold">{finding.title}</span>
                                                    {finding.column && (
                                                        <Badge variant="outline" className="text-[10px] font-mono">
                                                            col: {finding.column}
                                                        </Badge>
                                                    )}
                                                </div>
                                                <p className="text-sm text-foreground/80">{finding.description}</p>
                                                <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                                                    <div>
                                                        <span className="font-semibold block text-muted-foreground uppercase tracking-tight text-[10px]">Impact</span>
                                                        <p>{finding.impact}</p>
                                                    </div>
                                                    <div>
                                                        <span className="font-semibold block text-emerald-500 uppercase tracking-tight text-[10px]">Recommendation</span>
                                                        <p>{finding.recommendation}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </CardContent>
            )}
        </Card>
    );
}
