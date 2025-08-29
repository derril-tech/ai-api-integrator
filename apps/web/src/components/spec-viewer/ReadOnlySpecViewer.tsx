'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Eye, 
  Download, 
  Copy, 
  Print, 
  Share2, 
  Clock, 
  Shield,
  ExternalLink,
  AlertTriangle,
  Info,
  CheckCircle
} from 'lucide-react';
import { ParsedSpec } from '@/types/api-spec';

interface SharedSpecData {
  id: string;
  spec: ParsedSpec;
  metadata: {
    title: string;
    version: string;
    description?: string;
    endpoints: number;
    models: number;
  };
  permissions: {
    allowDownload: boolean;
    allowCopy: boolean;
    allowPrint: boolean;
    watermark?: string;
  };
  createdAt: number;
  expiresAt?: number;
}

interface ReadOnlySpecViewerProps {
  shareToken: string;
  className?: string;
}

export const ReadOnlySpecViewer: React.FC<ReadOnlySpecViewerProps> = ({
  shareToken,
  className = '',
}) => {
  const [sharedData, setSharedData] = useState<SharedSpecData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEndpoint, setSelectedEndpoint] = useState<string | null>(null);

  useEffect(() => {
    loadSharedSpec();
  }, [shareToken]);

  const loadSharedSpec = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/share/token/${shareToken}`);
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('This share link is invalid or has expired');
        }
        throw new Error('Failed to load shared specification');
      }

      const data = await response.json();
      setSharedData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load shared specification');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!sharedData?.permissions.allowDownload) return;

    try {
      const blob = new Blob([JSON.stringify(sharedData.spec, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${sharedData.metadata.title.replace(/\s+/g, '-')}-spec.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download failed:', err);
    }
  };

  const handleCopy = async () => {
    if (!sharedData?.permissions.allowCopy) return;

    try {
      await navigator.clipboard.writeText(JSON.stringify(sharedData.spec, null, 2));
      // Show success toast in real implementation
      console.log('Spec copied to clipboard');
    } catch (err) {
      console.error('Copy failed:', err);
    }
  };

  const handlePrint = () => {
    if (!sharedData?.permissions.allowPrint) return;
    window.print();
  };

  const getTimeRemaining = () => {
    if (!sharedData?.expiresAt) return null;
    
    const now = Date.now();
    const remaining = sharedData.expiresAt - now;
    
    if (remaining <= 0) return 'Expired';
    
    const days = Math.floor(remaining / (1000 * 60 * 60 * 24));
    const hours = Math.floor((remaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    if (days > 0) return `${days} day${days > 1 ? 's' : ''} remaining`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} remaining`;
    return 'Less than 1 hour remaining';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="text-muted-foreground">Loading shared specification...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md mx-auto">
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <AlertTriangle className="w-12 h-12 text-destructive mx-auto" />
              <div>
                <h3 className="text-lg font-semibold">Unable to Load Specification</h3>
                <p className="text-sm text-muted-foreground mt-2">{error}</p>
              </div>
              <Button onClick={loadSharedSpec} variant="outline">
                Try Again
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!sharedData) return null;

  const timeRemaining = getTimeRemaining();

  return (
    <div className={`min-h-screen bg-background ${className}`}>
      {/* Watermark */}
      {sharedData.permissions.watermark && (
        <div className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center">
          <div className="text-6xl font-bold text-muted-foreground/10 rotate-45 select-none">
            {sharedData.permissions.watermark}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div>
                <div className="flex items-center space-x-2">
                  <h1 className="text-2xl font-bold">{sharedData.metadata.title}</h1>
                  <Badge variant="outline">
                    <Eye className="w-3 h-3 mr-1" />
                    Read-Only
                  </Badge>
                </div>
                <p className="text-muted-foreground">
                  Version {sharedData.metadata.version}
                  {sharedData.metadata.description && ` • ${sharedData.metadata.description}`}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              {timeRemaining && (
                <Badge variant={timeRemaining === 'Expired' ? 'destructive' : 'secondary'}>
                  <Clock className="w-3 h-3 mr-1" />
                  {timeRemaining}
                </Badge>
              )}

              {sharedData.permissions.allowDownload && (
                <Button variant="outline" size="sm" onClick={handleDownload}>
                  <Download className="w-4 h-4 mr-2" />
                  Download
                </Button>
              )}

              {sharedData.permissions.allowCopy && (
                <Button variant="outline" size="sm" onClick={handleCopy}>
                  <Copy className="w-4 h-4 mr-2" />
                  Copy
                </Button>
              )}

              {sharedData.permissions.allowPrint && (
                <Button variant="outline" size="sm" onClick={handlePrint}>
                  <Print className="w-4 h-4 mr-2" />
                  Print
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        {/* Expiry Warning */}
        {timeRemaining && timeRemaining !== 'Expired' && timeRemaining.includes('hour') && (
          <Alert className="mb-6">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              This shared specification will expire in {timeRemaining.toLowerCase()}.
            </AlertDescription>
          </Alert>
        )}

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <ExternalLink className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-bold">{sharedData.metadata.endpoints}</p>
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
                  <p className="text-2xl font-bold">{sharedData.metadata.models}</p>
                  <p className="text-xs text-muted-foreground">Models</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Shield className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-bold">Read-Only</p>
                  <p className="text-xs text-muted-foreground">Access Level</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Share2 className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-bold">Shared</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(sharedData.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <Tabs defaultValue="endpoints" className="space-y-4">
          <TabsList>
            <TabsTrigger value="endpoints">
              Endpoints ({sharedData.metadata.endpoints})
            </TabsTrigger>
            <TabsTrigger value="models">
              Models ({sharedData.metadata.models})
            </TabsTrigger>
            <TabsTrigger value="auth">Authentication</TabsTrigger>
          </TabsList>

          <TabsContent value="endpoints" className="space-y-4">
            <div className="grid gap-4">
              {sharedData.spec.endpoints?.map((endpoint, index) => (
                <ReadOnlyEndpointCard
                  key={index}
                  endpoint={endpoint}
                  onSelect={() => setSelectedEndpoint(`${endpoint.method} ${endpoint.path}`)}
                  isSelected={selectedEndpoint === `${endpoint.method} ${endpoint.path}`}
                  allowCopy={sharedData.permissions.allowCopy}
                />
              ))}
            </div>
          </TabsContent>

          <TabsContent value="models" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              {sharedData.spec.models?.map((model, index) => (
                <ReadOnlyModelCard
                  key={index}
                  model={model}
                  allowCopy={sharedData.permissions.allowCopy}
                />
              ))}
            </div>
          </TabsContent>

          <TabsContent value="auth" className="space-y-4">
            <ReadOnlyAuthSummary 
              spec={sharedData.spec}
              allowCopy={sharedData.permissions.allowCopy}
            />
          </TabsContent>
        </Tabs>

        {/* Footer */}
        <div className="mt-12 pt-6 border-t text-center text-sm text-muted-foreground">
          <p>
            This is a read-only view of an API specification. 
            Some features may be limited for security purposes.
          </p>
        </div>
      </div>
    </div>
  );
};

// Sub-components for read-only display
interface ReadOnlyEndpointCardProps {
  endpoint: any;
  onSelect: () => void;
  isSelected: boolean;
  allowCopy: boolean;
}

const ReadOnlyEndpointCard: React.FC<ReadOnlyEndpointCardProps> = ({
  endpoint,
  onSelect,
  isSelected,
  allowCopy,
}) => {
  const methodColors = {
    GET: 'bg-blue-100 text-blue-800',
    POST: 'bg-green-100 text-green-800',
    PUT: 'bg-yellow-100 text-yellow-800',
    DELETE: 'bg-red-100 text-red-800',
    PATCH: 'bg-purple-100 text-purple-800',
  };

  const handleCopyEndpoint = async () => {
    if (!allowCopy) return;
    
    try {
      await navigator.clipboard.writeText(`${endpoint.method} ${endpoint.path}`);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  };

  return (
    <Card
      className={`cursor-pointer transition-all ${isSelected ? 'ring-2 ring-primary' : ''}`}
      onClick={onSelect}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Badge className={methodColors[endpoint.method as keyof typeof methodColors] || 'bg-gray-100 text-gray-800'}>
              {endpoint.method}
            </Badge>
            <span className="font-mono text-sm">{endpoint.path}</span>
          </div>
          {allowCopy && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleCopyEndpoint();
              }}
            >
              <Copy className="w-3 h-3" />
            </Button>
          )}
        </div>
        {endpoint.summary && (
          <p className="text-sm text-muted-foreground">{endpoint.summary}</p>
        )}
      </CardHeader>

      <CardContent className="pt-0">
        <div className="flex flex-wrap gap-2">
          {endpoint.tags?.map((tag: string) => (
            <Badge key={tag} variant="outline" className="text-xs">
              {tag}
            </Badge>
          ))}
          {endpoint.deprecated && (
            <Badge variant="destructive" className="text-xs">
              Deprecated
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

interface ReadOnlyModelCardProps {
  model: any;
  allowCopy: boolean;
}

const ReadOnlyModelCard: React.FC<ReadOnlyModelCardProps> = ({ model, allowCopy }) => {
  const handleCopyModel = async () => {
    if (!allowCopy) return;
    
    try {
      await navigator.clipboard.writeText(JSON.stringify(model.schema, null, 2));
    } catch (err) {
      console.error('Copy failed:', err);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{model.name}</CardTitle>
          {allowCopy && (
            <Button variant="ghost" size="sm" onClick={handleCopyModel}>
              <Copy className="w-3 h-3" />
            </Button>
          )}
        </div>
        {model.description && (
          <p className="text-sm text-muted-foreground">{model.description}</p>
        )}
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="text-sm">
            <strong>Type:</strong> {model.schema?.type || 'object'}
          </div>
          <div className="text-sm">
            <strong>Required:</strong> {model.schema?.required?.join(', ') || 'None'}
          </div>
          {model.schema?.properties && (
            <div className="text-sm">
              <strong>Properties:</strong> {Object.keys(model.schema.properties).length}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

interface ReadOnlyAuthSummaryProps {
  spec: ParsedSpec;
  allowCopy: boolean;
}

const ReadOnlyAuthSummary: React.FC<ReadOnlyAuthSummaryProps> = ({ spec, allowCopy }) => {
  const globalAuth = spec.globalSecurity || [];
  const endpointsWithAuth = spec.endpoints?.filter(ep => ep.security?.length > 0) || [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Authentication Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold">{spec.securitySchemes?.length || 0}</div>
              <div className="text-sm text-muted-foreground">Security Schemes</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{globalAuth.length}</div>
              <div className="text-sm text-muted-foreground">Global Auth</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{endpointsWithAuth.length}</div>
              <div className="text-sm text-muted-foreground">Endpoints with Auth</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {spec.securitySchemes && spec.securitySchemes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Security Schemes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {spec.securitySchemes.map((scheme, index) => (
                <div key={index} className="border rounded p-3">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium">{scheme.name}</h4>
                    <Badge variant="outline">{scheme.type}</Badge>
                  </div>
                  {scheme.description && (
                    <p className="text-sm text-muted-foreground mb-2">{scheme.description}</p>
                  )}
                  <div className="text-xs text-muted-foreground">
                    Location: {scheme.location || 'N/A'}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ReadOnlySpecViewer;
