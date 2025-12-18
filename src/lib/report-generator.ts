export function exportToJson(data: any, fileName: string) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export function generateBrandedReport(content: any) {
    // In a real app, this might use jspdf or a specialized printing view.
    // For now, we provide a clean JSON export that includes branding metadata.
    const report = {
        platform: "ChurnGuard AI",
        reportType: "Executive Consulting Analysis",
        timestamp: new Date().toISOString(),
        ...content
    };

    exportToJson(report, `ChurnGuard_Report_${new Date().getTime()}`);
}
