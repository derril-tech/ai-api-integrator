'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Upload,
  FileText,
  Zap,
  Settings,
  Download,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Info,
  Loader2
} from 'lucide-react';
import SpecViewer from '@/components/spec-viewer/SpecViewer';
import ModelExplorer from '@/components/spec-viewer/ModelExplorer';
import { ParsedSpec, InferenceResult, SpecFormat, InferenceAction } from '@/types/api-spec';

interface SpecViewerPageProps {
  projectId?: string;
  specId?: string;
}

export default function SpecViewerPage({ projectId, specId }: SpecViewerPageProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'viewer' | 'explorer'>('viewer');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // State for API specification
  const [spec, setSpec] = useState<ParsedSpec | null>(null);
  const [inferences, setInferences] = useState<InferenceResult[]>([]);
  const [format, setFormat] = useState<SpecFormat>('openapi');

  // UI state
  const [uploadProgress, setUploadProgress] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const [lastAnalysis, setLastAnalysis] = useState<Date | null>(null);

  // Load specification data
  useEffect(() => {
    if (specId) {
      loadSpecData(specId);
    } else if (projectId) {
      // Load latest spec for project
      loadLatestSpecForProject(projectId);
    }
  }, [specId, projectId]);

  const loadSpecData = async (id: string) => {
    setLoading(true);
    setError(null);

    try {
      // In a real implementation, this would call your API
      const response = await fetch(`/api/specs/${id}`);
      if (!response.ok) {
        throw new Error('Failed to load specification');
      }

      const data = await response.json();
      setSpec(data.spec);
      setInferences(data.inferences || []);
      setFormat(data.format);
      setLastAnalysis(data.lastAnalysis ? new Date(data.lastAnalysis) : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load specification');
    } finally {
      setLoading(false);
    }
  };

  const loadLatestSpecForProject = async (projectId: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/projects/${projectId}/specs/latest`);
      if (!response.ok) {
        throw new Error('Failed to load project specifications');
      }

      const data = await response.json();
      if (data.spec) {
        setSpec(data.spec);
        setInferences(data.inferences || []);
        setFormat(data.format);
        setLastAnalysis(data.lastAnalysis ? new Date(data.lastAnalysis) : null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load project specifications');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (file: File, format: SpecFormat) => {
    setLoading(true);
    setError(null);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('format', format);
      if (projectId) {
        formData.append('projectId', projectId);
      }

      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return prev;
          }
          return prev + 10;
        });
      }, 200);

      const response = await fetch('/api/specs/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to upload specification');
      }

      const data = await response.json();
      setSpec(data.spec);
      setInferences(data.inferences || []);
      setFormat(format);
      setLastAnalysis(new Date());
      setUploadProgress(100);

      // Redirect to the new spec if created
      if (data.specId && !specId) {
        router.push(`/spec-viewer?specId=${data.specId}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload specification');
    } finally {
      setLoading(false);
      setUploadProgress(0);
    }
  };

  const handleAnalyze = async () => {
    if (!spec) return;

    setAnalyzing(true);
    setError(null);

    try {
      const response = await fetch('/api/rag-inference/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          spec,
          format,
          context: {
            domain: 'api', // This would come from user input or project settings
            industry: 'technology',
          },
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to analyze specification');
      }

      const data = await response.json();
      setInferences(data.inferences || []);
      setLastAnalysis(new Date());

      // Show success message
      console.log('Analysis complete:', data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze specification');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleInferenceAction = async (
    inference: InferenceResult,
    action: InferenceAction,
    value?: any
  ) => {
    try {
      const response = await fetch('/api/rag-inference/validate-inference', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inference,
          action,
          value,
          feedback: action === 'accept' ? 'User accepted AI suggestion' :
                   action === 'reject' ? 'User rejected AI suggestion' :
                   'User provided custom override',
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to process inference action');
      }

      const data = await response.json();

      // Update local inferences based on action
      setInferences(prev => prev.map(inf =>
        inf.field === inference.field && inf.category === inference.category
          ? { ...inf, ...data.refinedInference }
          : inf
      ));

      console.log(`${action} action processed:`, data);
    } catch (err) {
      console.error('Failed to process inference action:', err);
    }
  };

  const handleModelUpdate = async (modelName: string, updates: Partial<ParsedSpec['models'][0]>) => {
    if (!spec) return;

    try {
      const updatedModels = spec.models.map(model =>
        model.name === modelName ? { ...model, ...updates } : model
      );

      const updatedSpec = { ...spec, models: updatedModels };
      setSpec(updatedSpec);

      // In a real implementation, this would save to the backend
      console.log('Model updated:', modelName, updates);
    } catch (err) {
      console.error('Failed to update model:', err);
    }
  };

  const getStatsSummary = () => {
    if (!spec) return null;

    const highConfidence = inferences.filter(inf => inf.confidence >= 0.8).length;
    const mediumConfidence = inferences.filter(inf => inf.confidence >= 0.6 && inf.confidence < 0.8).length;
    const lowConfidence = inferences.filter(inf => inf.confidence < 0.6).length;

    return {
      endpoints: spec.endpoints.length,
      models: spec.models.length,
      inferences: inferences.length,
      highConfidence,
      mediumConfidence,
      lowConfidence,
    };
  };

  const stats = getStatsSummary();

  if (loading && !spec) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="w-8 h-8 animate-spin mx-auto" />
          <p className="text-muted-foreground">Loading specification...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div>
                <h1 className="text-2xl font-bold">API Specification Viewer</h1>
                {spec && (
                  <p className="text-muted-foreground">
                    {spec.title} v{spec.version}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center space-x-2">
              {lastAnalysis && (
                <Badge variant="outline">
                  Last analyzed: {lastAnalysis.toLocaleString()}
                </Badge>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={handleAnalyze}
                disabled={!spec || analyzing}
              >
                {analyzing ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Zap className="w-4 h-4 mr-2" />
                )}
                {analyzing ? 'Analyzing...' : 'Analyze with AI'}
              </Button>

              <Button variant="outline" size="sm">
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>

              <Button variant="outline" size="sm">
                <Settings className="w-4 h-4 mr-2" />
                Settings
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        {/* Error Display */}
        {error && (
          <Alert className="mb-6" variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Upload Progress */}
        {uploadProgress > 0 && uploadProgress < 100 && (
          <Card className="mb-6">
            <CardContent className="pt-6">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Uploading specification...</span>
                  <span className="text-sm text-muted-foreground">{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} className="w-full" />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats Overview */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-2xl font-bold">{stats.endpoints}</p>
                    <p className="text-xs text-muted-foreground">Endpoints</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <Info className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-2xl font-bold">{stats.models}</p>
                    <p className="text-xs text-muted-foreground">Models</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <Zap className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-2xl font-bold">{stats.inferences}</p>
                    <p className="text-xs text-muted-foreground">AI Insights</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <div>
                    <p className="text-2xl font-bold">{stats.highConfidence}</p>
                    <p className="text-xs text-muted-foreground">High Confidence</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Main Content */}
        {!spec ? (
          <SpecUploadPrompt onUpload={handleFileUpload} />
        ) : (
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as any)}>
            <TabsList className="mb-6">
              <TabsTrigger value="viewer">Specification Viewer</TabsTrigger>
              <TabsTrigger value="explorer">Model Explorer</TabsTrigger>
            </TabsList>

            <TabsContent value="viewer" className="space-y-6">
              <SpecViewer
                spec={spec}
                inferences={inferences}
                onInferenceAction={handleInferenceAction}
              />
            </TabsContent>

            <TabsContent value="explorer" className="space-y-6">
              <ModelExplorer
                models={spec.models}
                inferences={inferences.filter(inf => inf.category === 'data_format')}
                onModelUpdate={handleModelUpdate}
                onInferenceAction={handleInferenceAction}
              />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}

// Upload Prompt Component
interface SpecUploadPromptProps {
  onUpload: (file: File, format: SpecFormat) => void;
}

const SpecUploadPrompt: React.FC<SpecUploadPromptProps> = ({ onUpload }) => {
  const [dragOver, setDragOver] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState<SpecFormat>('openapi');

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      onUpload(files[0], selectedFormat);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      onUpload(files[0], selectedFormat);
    }
  };

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="text-center">Upload API Specification</CardTitle>
      </CardHeader>
      <CardContent>
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'
          }`}
          onDrop={handleDrop}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
        >
          <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-semibold mb-2">Drop your API specification here</h3>
          <p className="text-muted-foreground mb-4">
            Supports OpenAPI 3.0/3.1, Postman Collections, and GraphQL schemas
          </p>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Format:</label>
              <select
                value={selectedFormat}
                onChange={(e) => setSelectedFormat(e.target.value as SpecFormat)}
                className="ml-2 px-3 py-1 border rounded"
              >
                <option value="openapi">OpenAPI (JSON/YAML)</option>
                <option value="postman">Postman Collection</option>
                <option value="graphql">GraphQL Schema</option>
              </select>
            </div>

            <div className="flex justify-center">
              <label className="cursor-pointer">
                <Button variant="outline" asChild>
                  <span>
                    <FileText className="w-4 h-4 mr-2" />
                    Choose File
                  </span>
                </Button>
                <input
                  type="file"
                  className="hidden"
                  accept=".json,.yaml,.yml,.graphql"
                  onChange={handleFileSelect}
                />
              </label>
            </div>
          </div>
        </div>

        <div className="mt-6 text-sm text-muted-foreground">
          <p className="mb-2"><strong>Supported formats:</strong></p>
          <ul className="list-disc list-inside space-y-1">
            <li>OpenAPI 3.0/3.1 specifications (JSON or YAML)</li>
            <li>Postman Collection v2.1+ (JSON)</li>
            <li>GraphQL schema definitions (SDL)</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
};
