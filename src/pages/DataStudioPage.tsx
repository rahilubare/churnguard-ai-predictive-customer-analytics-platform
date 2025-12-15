import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileUpload } from "@/components/ui/file-upload";
import { useAppStore } from "@/store/app-store";
import { ArrowRight, Loader2, AlertTriangle } from "lucide-react";
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
export function DataStudioPage() {
  const navigate = useNavigate();
  const setFile = useAppStore(s => s.setFile);
  const processFile = useAppStore(s => s.processFile);
  const isProcessing = useAppStore(s => s.isProcessing);
  const dataset = useAppStore(s => s.dataset);
  const datasetStats = useAppStore(s => s.datasetStats);
  const error = useAppStore(s => s.error);
  const rawFile = useAppStore(s => s.rawFile);
  const handleProcess = async () => {
    await processFile();
  };
  const previewRows = dataset?.rows.slice(0, 10) ?? [];
  return (
    <AppLayout container>
      <div className="py-8 md:py-10 lg:py-12">
        <div className="space-y-8 animate-fade-in">
          <header className="space-y-2">
            <h1 className="text-4xl font-bold tracking-tight">Data Studio</h1>
            <p className="text-lg text-muted-foreground">
              Upload, inspect, and prepare your customer data for model training.
            </p>
          </header>
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Processing Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Card>
            <CardHeader>
              <CardTitle>1. Upload Dataset</CardTitle>
              <CardDescription>
                Select a CSV file containing historical customer data. Ensure it includes a column indicating churn.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FileUpload onFileSelect={setFile} />
            </CardContent>
          </Card>
          {rawFile && !dataset && (
            <div className="flex justify-end">
              <Button onClick={handleProcess} disabled={isProcessing}>
                {isProcessing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    Inspect & Preview Data <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          )}
          {dataset && datasetStats && (
            <>
              <DatasetStats stats={datasetStats} />
              <Card className="animate-fade-in">
                <CardHeader>
                  <CardTitle>Data Preview</CardTitle>
                  <CardDescription>
                    Showing the first {previewRows.length} rows of your dataset. Verify that the data is parsed correctly.
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
                          <TableRow key={rowIndex}>
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
                    <Button onClick={() => navigate('/training')}>
                      Proceed to Model Lab <ArrowRight className="ml-2 h-4 w-4" />
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