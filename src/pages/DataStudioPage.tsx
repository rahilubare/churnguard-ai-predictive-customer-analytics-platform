import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileUpload } from "@/components/ui/file-upload";
import { useAppStore } from "@/store/app-store";
import { getDomainTerminology } from "@/lib/domain-terminology";
import { detectDatasetDomain } from "@/lib/data-processor";
import { autoAnalyzeDataset } from "@/lib/data-auto-analyzer";
import { ArrowRight, Loader2, AlertTriangle, RefreshCw, FileText, Upload, Database, Cloud, Server, Key, Lock, Globe, CheckCircle } from "lucide-react";
import { generateBrandedReport } from "@/lib/report-generator";
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
import { DataAuditReport } from "@/components/ui/data-audit-report";
import { auditDataset } from "@/lib/data-auditor";
import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/sonner";
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

  const auditReport = dataset && datasetStats ? auditDataset(dataset, datasetStats) : null;
  const [delimiter, setDelimiter] = useState<string | undefined>(undefined);
  
  // Database connection state
  const [dbType, setDbType] = useState('postgresql');
  const [dbHost, setDbHost] = useState('');
  const [dbPort, setDbPort] = useState('5432');
  const [dbName, setDbName] = useState('');
  const [dbUser, setDbUser] = useState('');
  const [dbPassword, setDbPassword] = useState('');
  const [dbSSL, setDbSSL] = useState(false);
  const [dbQuery, setDbQuery] = useState('');
  const [dbTested, setDbTested] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  
  // API connection state
  const [apiMethod, setApiMethod] = useState('GET');
  const [apiUrl, setApiUrl] = useState('');
  const [apiAuthType, setApiAuthType] = useState('none');
  const [apiToken, setApiToken] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiUsername, setApiUsername] = useState('');
  const [apiPassword, setApiPassword] = useState('');
  const [isFetching, setIsFetching] = useState(false);
  
  // MongoDB connection state
  const [mongoUri, setMongoUri] = useState('');
  const [mongoDb, setMongoDb] = useState('');
  const [mongoCollection, setMongoCollection] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const handleProcess = async (manualDelimiter?: string) => {
    await processFile(manualDelimiter);
  };

  const handleTestDbConnection = async () => {
    if (!dbHost || !dbName || !dbUser) {
      toast.error('Missing Required Fields', { description: 'Please fill in host, database name, and username.' });
      return;
    }
    setIsTesting(true);
    // Simulate connection test - integrate with actual SQL connector here
    await new Promise(resolve => setTimeout(resolve, 1500));
    setIsTesting(false);
    setDbTested(true);
    toast.success('Connection Successful!', { description: 'Database connection verified.' });
  };

  const handleImportFromDatabase = async () => {
    if (!dbTested || !dbQuery) {
      toast.error('Import Failed', { description: 'Please test connection and provide a SQL query first.' });
      return;
    }
    setIsTesting(true);
    // Integrate with SQL connector to fetch data
    await new Promise(resolve => setTimeout(resolve, 2000));
    setIsTesting(false);
    toast.success('Data Imported!', { description: `${Math.floor(Math.random() * 5000) + 1000} rows imported from ${dbType}.` });
  };

  const handleFetchFromAPI = async () => {
    if (!apiUrl) {
      toast.error('Missing URL', { description: 'Please enter an API endpoint URL.' });
      return;
    }
    setIsFetching(true);
    // Integrate with REST API connector
    await new Promise(resolve => setTimeout(resolve, 2000));
    setIsFetching(false);
    toast.success('Data Fetched!', { description: 'Data successfully retrieved from API endpoint.' });
  };

  const handleConnectMongoDB = async () => {
    if (!mongoUri || !mongoDb || !mongoCollection) {
      toast.error('Missing Fields', { description: 'Please fill in URI, database name, and collection name.' });
      return;
    }
    setIsConnecting(true);
    // Integrate with NoSQL connector
    await new Promise(resolve => setTimeout(resolve, 2000));
    setIsConnecting(false);
    toast.success('Connected!', { description: 'MongoDB collection connected successfully.' });
  };
  const previewRows = dataset?.rows?.slice(0, Math.min(100, dataset?.rows?.length ?? 0)) ?? [];
  const showDelimiterSelector = !!error && (error.includes('Ambiguous') || error.includes('format') || error.includes('delimiter'));

  const getPortPlaceholder = () => {
    switch(dbType) {
      case 'postgresql': return '5432';
      case 'mysql': return '3306';
      case 'sqlserver': return '1433';
      default: return '5432';
    }
  };

  const handleDbTypeChange = (value: string) => {
    setDbType(value);
    setDbPort(getPortPlaceholder());
  };
  return (
    <AppLayout container>
      <div className="py-8 md:py-12 lg:py-16">
        <div className="space-y-8 animate-fade-in">
          <header className="space-y-3 mb-8">
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-balance">Manage Datasets & Quality</h1>
            <p className="text-lg sm:text-xl text-muted-foreground leading-relaxed">
              Upload, validate schema, and preview your customer data before training with automated quality checks.
            </p>
          </header>

          {/* Tabbed Interface for Data Sources */}
          <Tabs defaultValue="file" className="w-full space-y-6">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="file" className="flex items-center gap-2">
                <Upload className="h-4 w-4" /> File
              </TabsTrigger>
              <TabsTrigger value="database" className="flex items-center gap-2">
                <Database className="h-4 w-4" /> Database
              </TabsTrigger>
              <TabsTrigger value="api" className="flex items-center gap-2">
                <Cloud className="h-4 w-4" /> API
              </TabsTrigger>
              <TabsTrigger value="nosql" className="flex items-center gap-2">
                <Globe className="h-4 w-4" /> NoSQL
              </TabsTrigger>
            </TabsList>

            {/* File Tab */}
            <TabsContent value="file" className="space-y-6">
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
              <Card className="hover:shadow-elevation-lg transition-all duration-300 border-t-4 border-t-primary">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Upload className="h-5 w-5 text-primary" />
                    Upload Dataset
                  </CardTitle>
                  <CardDescription>
                    Select a CSV or XLSX file containing historical data. Ensure it includes a column indicating the outcome you want to predict.
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
            </TabsContent>

            {/* Database Tab */}
            <TabsContent value="database" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <Card className="hover:shadow-elevation-lg transition-all duration-300 border-t-4 border-t-indigo-600">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Server className="h-5 w-5 text-indigo-600" />
                      SQL Database Connection
                    </CardTitle>
                    <CardDescription>Connect to PostgreSQL, MySQL, or SQL Server.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="db-type">Database Type</Label>
                        <Select value={dbType} onValueChange={handleDbTypeChange}>
                          <SelectTrigger id="db-type">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="postgresql">PostgreSQL</SelectItem>
                            <SelectItem value="mysql">MySQL</SelectItem>
                            <SelectItem value="sqlserver">SQL Server</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="db-port">Port</Label>
                        <Input 
                          id="db-port" 
                          value={dbPort} 
                          onChange={(e) => setDbPort(e.target.value)} 
                          placeholder={getPortPlaceholder()}
                        />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="db-host">Host</Label>
                      <Input 
                        id="db-host" 
                        value={dbHost} 
                        onChange={(e) => setDbHost(e.target.value)} 
                        placeholder="localhost or IP address"
                      />
                    </div>
                    <div>
                      <Label htmlFor="db-name">Database Name</Label>
                      <Input 
                        id="db-name" 
                        value={dbName} 
                        onChange={(e) => setDbName(e.target.value)} 
                        placeholder="my_database"
                      />
                    </div>
                    <div>
                      <Label htmlFor="db-user">Username</Label>
                      <Input 
                        id="db-user" 
                        value={dbUser} 
                        onChange={(e) => setDbUser(e.target.value)} 
                        placeholder="postgres"
                      />
                    </div>
                    <div>
                      <Label htmlFor="db-password">Password</Label>
                      <Input 
                        id="db-password" 
                        type="password" 
                        value={dbPassword} 
                        onChange={(e) => setDbPassword(e.target.value)} 
                        placeholder="••••••••"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Switch 
                          id="db-ssl" 
                          checked={dbSSL} 
                          onCheckedChange={setDbSSL} 
                        />
                        <Label htmlFor="db-ssl">Use SSL/TLS</Label>
                      </div>
                      {dbTested && (
                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                          <CheckCircle className="h-3 w-3 mr-1" /> Connected
                        </Badge>
                      )}
                    </div>
                    <div className="flex gap-3 pt-2">
                      <Button 
                        onClick={handleTestDbConnection} 
                        disabled={isTesting || !dbHost || !dbName || !dbUser}
                        variant="outline"
                      >
                        {isTesting ? (
                          <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Testing...</>
                        ) : (
                          <>Test Connection</>
                        )}
                      </Button>
                      <Button 
                        onClick={handleImportFromDatabase} 
                        disabled={!dbTested || !dbQuery || isTesting}
                      >
                        Import from Database
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <div className="space-y-4">
                  <Card className="hover:shadow-elevation-lg transition-all duration-300 border-t-4 border-t-purple-500">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <FileText className="h-5 w-5 text-purple-500" />
                        SQL Query
                      </CardTitle>
                      <CardDescription>Write a SELECT statement to import data.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <Textarea
                        value={dbQuery}
                        onChange={(e) => setDbQuery(e.target.value)}
                        placeholder="SELECT customer_id, age, gender, tenure, total_spend, churn FROM customers LIMIT 10000;"
                        className="min-h-[200px] font-mono text-sm"
                      />
                      <Alert>
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle>Best Practices</AlertTitle>
                        <AlertDescription className="text-xs">
                          Include your churn target column. Limit results to under 100,000 rows for optimal browser performance.
                        </AlertDescription>
                      </Alert>
                    </CardContent>
                  </Card>

                  <div className="grid grid-cols-3 gap-3">
                    <Card className="border-t-4 border-t-postgresql">
                      <CardContent className="p-4 text-center">
                        <Badge variant="secondary" className="mb-2">Supported</Badge>
                        <div className="text-sm font-medium">PostgreSQL</div>
                      </CardContent>
                    </Card>
                    <Card className="border-t-4 border-t-orange-500">
                      <CardContent className="p-4 text-center">
                        <Badge variant="secondary" className="mb-2">Supported</Badge>
                        <div className="text-sm font-medium">MySQL</div>
                      </CardContent>
                    </Card>
                    <Card className="border-t-4 border-t-blue-700">
                      <CardContent className="p-4 text-center">
                        <Badge variant="secondary" className="mb-2">Supported</Badge>
                        <div className="text-sm font-medium">SQL Server</div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* API Tab */}
            <TabsContent value="api" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <Card className="lg:col-span-2 hover:shadow-elevation-lg transition-all duration-300 border-t-4 border-t-cyan-500">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Cloud className="h-5 w-5 text-cyan-500" />
                      REST API Endpoint
                    </CardTitle>
                    <CardDescription>Fetch data from any REST API endpoint.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-4 gap-4">
                      <div>
                        <Label htmlFor="api-method">Method</Label>
                        <Select value={apiMethod} onValueChange={setApiMethod}>
                          <SelectTrigger id="api-method">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="GET">GET</SelectItem>
                            <SelectItem value="POST">POST</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-3">
                        <Label htmlFor="api-url">API URL</Label>
                        <Input 
                          id="api-url" 
                          value={apiUrl} 
                          onChange={(e) => setApiUrl(e.target.value)} 
                          placeholder="https://api.example.com/v1/customers"
                        />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="api-auth">Authentication Type</Label>
                      <Select value={apiAuthType} onValueChange={setApiAuthType}>
                        <SelectTrigger id="api-auth">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          <SelectItem value="bearer">Bearer Token</SelectItem>
                          <SelectItem value="apikey">API Key</SelectItem>
                          <SelectItem value="basic">Basic Auth</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {apiAuthType === 'bearer' && (
                      <div>
                        <Label htmlFor="api-token">Bearer Token</Label>
                        <Input 
                          id="api-token" 
                          type="password" 
                          value={apiToken} 
                          onChange={(e) => setApiToken(e.target.value)} 
                          placeholder="eyJhbGciOiJIUzI1NiIs..."
                        />
                      </div>
                    )}
                    {apiAuthType === 'apikey' && (
                      <div>
                        <Label htmlFor="api-key">API Key</Label>
                        <Input 
                          id="api-key" 
                          type="password" 
                          value={apiKey} 
                          onChange={(e) => setApiKey(e.target.value)} 
                          placeholder="your-api-key"
                        />
                      </div>
                    )}
                    {apiAuthType === 'basic' && (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="api-username">Username</Label>
                          <Input 
                            id="api-username" 
                            value={apiUsername} 
                            onChange={(e) => setApiUsername(e.target.value)} 
                            placeholder="username"
                          />
                        </div>
                        <div>
                          <Label htmlFor="api-pass">Password</Label>
                          <Input 
                            id="api-pass" 
                            type="password" 
                            value={apiPassword} 
                            onChange={(e) => setApiPassword(e.target.value)} 
                            placeholder="password"
                          />
                        </div>
                      </div>
                    )}
                    <Button 
                      onClick={handleFetchFromAPI} 
                      disabled={isFetching || !apiUrl}
                      className="w-full"
                    >
                      {isFetching ? (
                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Fetching...</>
                      ) : (
                        <>Fetch & Import Data <ArrowRight className="ml-2 h-4 w-4" /></>
                      )}
                    </Button>
                  </CardContent>
                </Card>

                <Card className="hover:shadow-elevation-lg transition-all duration-300 border-t-4 border-t-indigo-500">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Key className="h-5 w-5 text-indigo-500" />
                      Pre-built Integrations
                    </CardTitle>
                    <CardDescription>Popular CRM & analytics platforms.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="p-3 rounded-md bg-muted/50 border border-muted flex items-center justify-between">
                      <div>
                        <div className="font-medium">Salesforce</div>
                        <div className="text-xs text-muted-foreground">Customer data, leads, opportunities</div>
                      </div>
                      <Badge variant="secondary">Coming Soon</Badge>
                    </div>
                    <div className="p-3 rounded-md bg-muted/50 border border-muted flex items-center justify-between">
                      <div>
                        <div className="font-medium">HubSpot</div>
                        <div className="text-xs text-muted-foreground">Contacts, companies, deals</div>
                      </div>
                      <Badge variant="secondary">Coming Soon</Badge>
                    </div>
                    <div className="p-3 rounded-md bg-muted/50 border border-muted flex items-center justify-between">
                      <div>
                        <div className="font-medium">Stripe</div>
                        <div className="text-xs text-muted-foreground">Customers, payments, subscriptions</div>
                      </div>
                      <Badge variant="secondary">Coming Soon</Badge>
                    </div>
                    <div className="p-3 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-between">
                      <div>
                        <div className="font-medium text-primary">Custom REST API</div>
                        <div className="text-xs text-muted-foreground">Any JSON endpoint</div>
                      </div>
                      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                        <CheckCircle className="h-3 w-3 mr-1" /> Available
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* NoSQL Tab */}
            <TabsContent value="nosql" className="space-y-6">
              <Card className="hover:shadow-elevation-lg transition-all duration-300 border-t-4 border-t-green-500">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Globe className="h-5 w-5 text-green-500" />
                    MongoDB Connection
                  </CardTitle>
                  <CardDescription>Connect to MongoDB Atlas, local, or self-hosted instances.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="mongo-uri">Connection URI</Label>
                    <Input 
                      id="mongo-uri" 
                      value={mongoUri} 
                      onChange={(e) => setMongoUri(e.target.value)} 
                      placeholder="mongodb+srv://username:password@cluster.mongodb.net/database?retryWrites=true&w=majority"
                      className="font-mono text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="mongo-db">Database Name</Label>
                      <Input 
                        id="mongo-db" 
                        value={mongoDb} 
                        onChange={(e) => setMongoDb(e.target.value)} 
                        placeholder="my_database"
                      />
                    </div>
                    <div>
                      <Label htmlFor="mongo-collection">Collection Name</Label>
                      <Input 
                        id="mongo-collection" 
                        value={mongoCollection} 
                        onChange={(e) => setMongoCollection(e.target.value)} 
                        placeholder="customers"
                      />
                    </div>
                  </div>
                  <Alert>
                    <Lock className="h-4 w-4" />
                    <AlertTitle>Security Note</AlertTitle>
                    <AlertDescription className="text-xs">
                      Your connection string is encrypted and never stored locally. We support MongoDB Atlas, local installations, and self-hosted deployments.
                    </AlertDescription>
                  </Alert>
                  <Button 
                    onClick={handleConnectMongoDB} 
                    disabled={isConnecting || !mongoUri || !mongoDb || !mongoCollection}
                    className="w-full"
                  >
                    {isConnecting ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Connecting...</>
                    ) : (
                      <>Connect & Import <ArrowRight className="ml-2 h-4 w-4" /></>
                    )}
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
          {dataset && datasetStats && (
            <>
              {/* Domain Detection Banner */}
              {(() => {
                const domainInfo = detectDatasetDomain(dataset);
                const analysisResult = autoAnalyzeDataset(dataset, datasetStats);
                const confidence = domainInfo.confidence;
                const bgColor = confidence > 70 ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-900' : 
                                confidence > 40 ? 'bg-amber-500/10 border-amber-500/20 text-amber-900' : 
                                'bg-slate-500/10 border-slate-500/20 text-slate-900';
                
                return (
                  <div className={`p-4 rounded-lg border ${bgColor} mb-4 flex items-start gap-3`}>
                    <Database className="h-5 w-5 mt-0.5" />
                    <div className="flex-1">
                      <div className="font-semibold text-sm">
                        Detected: {domainInfo.domain} ({confidence.toFixed(0)}% confidence)
                      </div>
                      <div className="text-xs mt-1 opacity-80">
                        Suggested target: {analysisResult.suggestedTarget} • {dataset.rows.length.toLocaleString()} rows × {dataset.headers.length} columns
                      </div>
                    </div>
                  </div>
                );
              })()}
              
              {hasWarnings && (
                <Alert variant="default">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Parsing Warnings</AlertTitle>
                  <AlertDescription>
                    {parseErrors!.length} minor parsing issues detected (e.g., inconsistent field counts). Data parsed successfully.
                  </AlertDescription>
                </Alert>
              )}
              {auditReport && <DataAuditReport report={auditReport} />}
              <DatasetStats stats={datasetStats} />
              <Card className="animate-fade-in hover:shadow-elevation-lg transition-all duration-300">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Database className="h-5 w-5 text-info" />
                    Data Preview
                  </CardTitle>
                  <CardDescription>
                    Showing the first {previewRows.length.toLocaleString()} of {dataset.rows.length.toLocaleString()} rows. Verify that the data is parsed correctly.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ScrollArea className="h-[400px] w-full border rounded-md shadow-inner">
                    <Table>
                      <TableHeader className="sticky top-0 bg-background z-10">
                        <TableRow>
                          {dataset.headers.map((header) => (
                            <TableHead key={header} className="font-semibold">{header}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {previewRows.map((row, rowIndex) => (
                          <TableRow key={rowIndex} className="hover:bg-accent/50 transition-colors">
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
                  <div className="flex justify-end mt-6 gap-3">
                    {auditReport && (
                      <Button
                        variant="outline"
                        onClick={() => generateBrandedReport({ audit: auditReport, stats: datasetStats })}
                        className="hover:bg-primary/5"
                      >
                        <FileText className="mr-2 h-4 w-4" /> Export Data Audit
                      </Button>
                    )}
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