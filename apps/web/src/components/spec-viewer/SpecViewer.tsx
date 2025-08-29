'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertCircle, CheckCircle, Info, Zap, Eye, EyeOff } from 'lucide-react';
import { ParsedSpec, InferenceResult } from '@/types/api-spec';

interface SpecViewerProps {
  spec: ParsedSpec;
  inferences?: InferenceResult[];
  onInferenceAction?: (inference: InferenceResult, action: 'accept' | 'reject' | 'override', value?: any) => void;
  className?: string;
}

export const SpecViewer: React.FC<SpecViewerProps> = ({
  spec,
  inferences = [],
  onInferenceAction,
  className = '',
}) => {
  const [selectedEndpoint, setSelectedEndpoint] = useState<string | null>(null);
  const [showInferredOnly, setShowInferredOnly] = useState(false);

  // Group inferences by category
  const inferencesByCategory = inferences.reduce((acc, inf) => {
    if (!acc[inf.category]) acc[inf.category] = [];
    acc[inf.category].push(inf);
    return acc;
  }, {} as Record<string, InferenceResult[]>);

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'bg-green-100 text-green-800';
    if (confidence >= 0.6) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  const getConfidenceIcon = (confidence: number) => {
    if (confidence >= 0.8) return <CheckCircle className="w-4 h-4" />;
    if (confidence >= 0.6) return <Info className="w-4 h-4" />;
    return <AlertCircle className="w-4 h-4" />;
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl">{spec.title}</CardTitle>
              <p className="text-muted-foreground">Version {spec.version}</p>
              {spec.description && (
                <p className="mt-2 text-sm">{spec.description}</p>
              )}
            </div>
            <div className="flex items-center space-x-2">
              <Badge variant="outline">{spec.endpoints.length} endpoints</Badge>
              <Badge variant="outline">{spec.models.length} models</Badge>
              <Badge variant="outline">{inferences.length} inferences</Badge>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Inference Summary */}
      {inferences.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Zap className="w-5 h-5" />
              <span>AI Inferences</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              {Object.entries(inferencesByCategory).map(([category, categoryInferences]) => (
                <div key={category} className="text-center">
                  <div className="text-2xl font-bold text-primary">
                    {categoryInferences.length}
                  </div>
                  <div className="text-sm text-muted-foreground capitalize">
                    {category.replace('_', ' ')}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Avg: {Math.round(categoryInferences.reduce((sum, inf) => sum + inf.confidence, 0) / categoryInferences.length * 100)}%
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center space-x-2">
              <Button
                variant={showInferredOnly ? "default" : "outline"}
                size="sm"
                onClick={() => setShowInferredOnly(!showInferredOnly)}
              >
                {showInferredOnly ? <EyeOff className="w-4 h-4 mr-2" /> : <Eye className="w-4 h-4 mr-2" />}
                {showInferredOnly ? 'Show All' : 'Show Inferred Only'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Content */}
      <Tabs defaultValue="endpoints" className="space-y-4">
        <TabsList>
          <TabsTrigger value="endpoints">Endpoints ({spec.endpoints.length})</TabsTrigger>
          <TabsTrigger value="models">Models ({spec.models.length})</TabsTrigger>
          <TabsTrigger value="inferences">Inferences ({inferences.length})</TabsTrigger>
          <TabsTrigger value="auth">Authentication</TabsTrigger>
        </TabsList>

        <TabsContent value="endpoints" className="space-y-4">
          <div className="grid gap-4">
            {spec.endpoints
              .filter(endpoint => !showInferredOnly || inferences.some(inf => inf.category === 'auth' || inf.category === 'pagination'))
              .map((endpoint, index) => (
                <EndpointCard
                  key={index}
                  endpoint={endpoint}
                  inferences={inferences}
                  onInferenceAction={onInferenceAction}
                  onSelect={() => setSelectedEndpoint(`${endpoint.method} ${endpoint.path}`)}
                  isSelected={selectedEndpoint === `${endpoint.method} ${endpoint.path}`}
                />
              ))}
          </div>
        </TabsContent>

        <TabsContent value="models" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {spec.models.map((model, index) => (
              <ModelCard
                key={index}
                model={model}
                inferences={inferences.filter(inf => inf.category === 'data_format')}
                onInferenceAction={onInferenceAction}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="inferences" className="space-y-4">
          <div className="grid gap-4">
            {inferences.map((inference, index) => (
              <InferenceCard
                key={index}
                inference={inference}
                onAction={onInferenceAction}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="auth" className="space-y-4">
          <AuthSummary
            spec={spec}
            authInferences={inferences.filter(inf => inf.category === 'auth')}
            onInferenceAction={onInferenceAction}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

// Sub-components
interface EndpointCardProps {
  endpoint: ParsedSpec['endpoints'][0];
  inferences: InferenceResult[];
  onInferenceAction?: (inference: InferenceResult, action: 'accept' | 'reject' | 'override', value?: any) => void;
  onSelect: () => void;
  isSelected: boolean;
}

const EndpointCard: React.FC<EndpointCardProps> = ({
  endpoint,
  inferences,
  onInferenceAction,
  onSelect,
  isSelected,
}) => {
  const relevantInferences = inferences.filter(inf =>
    inf.category === 'auth' || inf.category === 'pagination'
  );

  const methodColors = {
    GET: 'bg-blue-100 text-blue-800',
    POST: 'bg-green-100 text-green-800',
    PUT: 'bg-yellow-100 text-yellow-800',
    DELETE: 'bg-red-100 text-red-800',
    PATCH: 'bg-purple-100 text-purple-800',
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
          {relevantInferences.length > 0 && (
            <Badge variant="secondary" className="flex items-center space-x-1">
              <Zap className="w-3 h-3" />
              <span>{relevantInferences.length}</span>
            </Badge>
          )}
        </div>
        {endpoint.summary && (
          <p className="text-sm text-muted-foreground">{endpoint.summary}</p>
        )}
      </CardHeader>

      <CardContent className="pt-0">
        <div className="flex flex-wrap gap-2 mb-3">
          {endpoint.tags.map(tag => (
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

        {relevantInferences.length > 0 && (
          <div className="space-y-2">
            {relevantInferences.slice(0, 2).map((inference, index) => (
              <InferenceBadge
                key={index}
                inference={inference}
                onAction={onInferenceAction}
                compact
              />
            ))}
            {relevantInferences.length > 2 && (
              <p className="text-xs text-muted-foreground">
                +{relevantInferences.length - 2} more inferences
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

interface ModelCardProps {
  model: ParsedSpec['models'][0];
  inferences: InferenceResult[];
  onInferenceAction?: (inference: InferenceResult, action: 'accept' | 'reject' | 'override', value?: any) => void;
}

const ModelCard: React.FC<ModelCardProps> = ({ model, inferences, onInferenceAction }) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{model.name}</CardTitle>
        {model.description && (
          <p className="text-sm text-muted-foreground">{model.description}</p>
        )}
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="text-sm">
            <strong>Type:</strong> {model.schema.type}
          </div>
          <div className="text-sm">
            <strong>Required:</strong> {model.schema.required?.join(', ') || 'None'}
          </div>
          {model.schema.properties && (
            <div className="text-sm">
              <strong>Properties:</strong> {Object.keys(model.schema.properties).length}
            </div>
          )}
        </div>

        {inferences.length > 0 && (
          <div className="mt-4 space-y-2">
            {inferences.map((inference, index) => (
              <InferenceBadge
                key={index}
                inference={inference}
                onAction={onInferenceAction}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

interface InferenceCardProps {
  inference: InferenceResult;
  onAction?: (inference: InferenceResult, action: 'accept' | 'reject' | 'override', value?: any) => void;
}

const InferenceCard: React.FC<InferenceCardProps> = ({ inference, onAction }) => {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg capitalize">{inference.field}</CardTitle>
          <Badge className={getConfidenceColor(inference.confidence)}>
            {Math.round(inference.confidence * 100)}%
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <h4 className="font-semibold mb-2">Inferred Value</h4>
            <pre className="bg-muted p-3 rounded text-sm overflow-x-auto">
              {JSON.stringify(inference.inferredValue, null, 2)}
            </pre>
          </div>

          <div>
            <h4 className="font-semibold mb-2">Reasoning</h4>
            <p className="text-sm text-muted-foreground">{inference.reasoning}</p>
          </div>

          {inference.evidence.length > 0 && (
            <div>
              <h4 className="font-semibold mb-2">Evidence</h4>
              <ul className="text-sm space-y-1">
                {inference.evidence.map((evidence, index) => (
                  <li key={index} className="flex items-start space-x-2">
                    <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <span>{evidence}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {inference.provenance.length > 0 && (
            <div>
              <h4 className="font-semibold mb-2">Provenance</h4>
              <div className="space-y-2">
                {inference.provenance.map((prov, index) => (
                  <div key={index} className="bg-muted p-3 rounded">
                    <div className="flex items-center justify-between mb-1">
                      <Badge variant="outline" className="text-xs">
                        {prov.source.replace('_', ' ')}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {Math.round(prov.confidence * 100)}%
                      </span>
                    </div>
                    <p className="text-sm">{prov.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {onAction && (
            <div className="flex space-x-2 pt-4 border-t">
              <Button
                size="sm"
                onClick={() => onAction(inference, 'accept')}
                className="flex-1"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                Accept
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onAction(inference, 'reject')}
                className="flex-1"
              >
                <AlertCircle className="w-4 h-4 mr-2" />
                Reject
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onAction(inference, 'override')}
                className="flex-1"
              >
                <Info className="w-4 h-4 mr-2" />
                Override
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

interface InferenceBadgeProps {
  inference: InferenceResult;
  onAction?: (inference: InferenceResult, action: 'accept' | 'reject' | 'override', value?: any) => void;
  compact?: boolean;
}

const InferenceBadge: React.FC<InferenceBadgeProps> = ({ inference, onAction, compact = false }) => {
  const [showActions, setShowActions] = useState(false);

  if (compact) {
    return (
      <div className="flex items-center space-x-2">
        <Badge
          variant="secondary"
          className={`flex items-center space-x-1 cursor-pointer ${getConfidenceColor(inference.confidence)}`}
          onClick={() => setShowActions(!showActions)}
        >
          {getConfidenceIcon(inference.confidence)}
          <span className="capitalize">{inference.category.replace('_', ' ')}</span>
          <span>({Math.round(inference.confidence * 100)}%)</span>
        </Badge>

        {showActions && onAction && (
          <div className="flex space-x-1">
            <Button size="sm" variant="outline" onClick={() => onAction(inference, 'accept')}>
              ✓
            </Button>
            <Button size="sm" variant="outline" onClick={() => onAction(inference, 'reject')}>
              ✗
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="border rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-2">
          {getConfidenceIcon(inference.confidence)}
          <span className="font-medium capitalize">{inference.field}</span>
          <Badge className={getConfidenceColor(inference.confidence)}>
            {Math.round(inference.confidence * 100)}%
          </Badge>
        </div>

        {onAction && (
          <div className="flex space-x-1">
            <Button size="sm" variant="outline" onClick={() => onAction(inference, 'accept')}>
              Accept
            </Button>
            <Button size="sm" variant="outline" onClick={() => onAction(inference, 'reject')}>
              Reject
            </Button>
          </div>
        )}
      </div>

      <p className="text-sm text-muted-foreground">{inference.reasoning}</p>

      {inference.alternatives && inference.alternatives.length > 0 && (
        <div className="mt-2">
          <p className="text-xs text-muted-foreground mb-1">Alternatives:</p>
          <div className="flex flex-wrap gap-1">
            {inference.alternatives.map((alt, index) => (
              <Badge
                key={index}
                variant="outline"
                className="text-xs cursor-pointer"
                onClick={() => onAction?.(inference, 'override', alt.value)}
              >
                {alt.value.type || alt.value} ({Math.round(alt.confidence * 100)}%)
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

interface AuthSummaryProps {
  spec: ParsedSpec;
  authInferences: InferenceResult[];
  onInferenceAction?: (inference: InferenceResult, action: 'accept' | 'reject' | 'override', value?: any) => void;
}

const AuthSummary: React.FC<AuthSummaryProps> = ({ spec, authInferences, onInferenceAction }) => {
  const globalAuth = spec.globalSecurity;
  const endpointsWithAuth = spec.endpoints.filter(ep => ep.security.length > 0);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Authentication Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold">{spec.securitySchemes.length}</div>
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

      {spec.securitySchemes.length > 0 && (
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

      {authInferences.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Inferred Authentication</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {authInferences.map((inference, index) => (
                <InferenceCard
                  key={index}
                  inference={inference}
                  onAction={onInferenceAction}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

// Helper functions
const getConfidenceColor = (confidence: number): string => {
  if (confidence >= 0.8) return 'bg-green-100 text-green-800';
  if (confidence >= 0.6) return 'bg-yellow-100 text-yellow-800';
  return 'bg-red-100 text-red-800';
};

const getConfidenceIcon = (confidence: number): React.ReactNode => {
  if (confidence >= 0.8) return <CheckCircle className="w-4 h-4" />;
  if (confidence >= 0.6) return <Info className="w-4 h-4" />;
  return <AlertCircle className="w-4 h-4" />;
};

export default SpecViewer;
