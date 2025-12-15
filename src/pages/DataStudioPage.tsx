import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileUpload } from "@/components/ui/file-upload";
import { useAppStore } from "@/store/app-store";
import { ArrowRight, Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { DatasetStats } from "@/components/ui/dataset-stats";
import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
export function DataStudioPage() {
  const navigate = useNavigate();
  const setFile = useAppStore(s => s.setFile);
  const processFile = useAppStore(s => s.processFile);
  const isProcessing = useAppStore(s => s.isProcessing);
  const dataset = useAppStore(s => s.dataset);
  const datasetStats = useAppStore(s => s.datasetStats);
  const error = useAppStore(s => s.error);
  const rawFile = useAppStore(s => s.rawFile);
  const parseErrors = useAppStore(s => s.parseErrors);
  const hasWarnings = parseErrors?.length > 0;
  const [delimiter, setDelimiter] = useState<string | undefined>(undefined);
  const handleProcess = async (manualDelimiter?: string) => {
    await processFile(manualDelimiter);
  };
  const previewRows = dataset?.rows?.slice(0, Math.min(100, dataset?.rows?.length ?? 0)) ?? [];
  const showDelimiterSelector = !!error && (error.includes('Ambiguous') || error.includes('format') || error.includes('delimiter'));
  return (
    <AppLayout container>
      <div className="py-8 md:py-10 lg:py-12">
        <div className="space-y-8 animate-fade-in">
          <header className="space-y-2">
            <h1 className="text-4xl font-bold tracking-tight">Manage Datasets & Quality</h1>
            <p className="text-lg text-muted-foreground">
              Upload, validate schema, and preview your customer data before training.
            </p>
          </header>
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Processing Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {showDelimiterSelector && rawFile && (
            <Card className="bg-destructive/10 border-destructive">
              <CardHeader>
                <CardTitle>Parsing Ambiguous</CardTitle>
                <CardDescription>We had trouble automatically parsing your CSV. Please select the correct delimiter and retry.</CardDescription>
              </CardHeader>
              <CardContent className="flex items-end gap-4">
                <div className="flex-grow">
                  <Label htmlFor="delimiter-select">Delimiter</Label>
                  <Select onValueChange={setDelimiter} defaultValue={delimiter}>
                    <SelectTrigger id="delimiter-select">
                      <SelectValue placeholder="Select a delimiter..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value=",">Comma (,)</SelectItem>
                      <SelectItem value=";">Semicolon (;)</SelectItem>
                      <SelectItem value="\t">Tab</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={() => handleProcess(delimiter)} disabled={isProcessing || !delimiter}>
                  <RefreshCw className="mr-2 h-4 w-4" /> Retry Parse
                </Button>
              </CardContent>
            </Card>
          )}
          <Card className="hover:shadow-lg transition-shadow duration-200">
            <CardHeader>
              <CardTitle>1. Upload Dataset</CardTitle>
              <CardDescription>
                Select a CSV or XLSX file containing historical customer data. Ensure it includes a column indicating churn.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FileUpload onFileSelect={setFile} />
            </CardContent>
          </Card>
          {rawFile && !dataset && !showDelimiterSelector && (
            <div className="flex justify-end">
              <Button onClick={() => handleProcess()} disabled={isProcessing}>
                {isProcessing ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing...</>
                ) : (
                  <>Inspect & Preview Data <ArrowRight className="ml-2 h-4 w-4" /></>
                )}
              </Button>
            </div>
          )}
          {dataset && datasetStats && (
            <>
              {hasWarnings && (
                <Alert variant="default">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Parsing Warnings</AlertTitle>
                  <AlertDescription>
                    {parseErrors!.length} minor parsing issues detected (e.g., inconsistent field counts). Data parsed successfully.
                  </AlertDescription>
                </Alert>
              )}
              <DatasetStats stats={datasetStats} />
              <Card className="animate-fade-in hover:shadow-lg transition-shadow duration-200">
                <CardHeader>
                  <CardTitle>Data Preview</CardTitle>
                  <CardDescription>
                    Showing the first {previewRows.length} of {dataset.rows.length} rows. Verify that the data is parsed correctly.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[400px] w-full border rounded-md">
                    <Table>
                      <TableHeader className="sticky top-0 bg-background">
                        <TableRow>
                          {dataset.headers.map((header) => (
                            <TableHead key={header}>{header}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {previewRows.map((row, rowIndex) => (
                          <TableRow key={rowIndex} className="hover:bg-accent">
                            {dataset.headers.map((header) => (
                              <TableCell key={`${rowIndex}-${header}`}>
                                {String(row[header] ?? '')}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                  <div className="flex justify-end mt-6">
                    <Button onClick={() => navigate('/training')} className="hover:shadow-glow hover:scale-105 transition-all">
                      {hasWarnings ? 'Proceed Despite Warnings' : 'Train Model'} <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </AppLayout>
  );
}