'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { CheckCircle, AlertCircle, Info, Edit, Plus, Trash2, Zap } from 'lucide-react';
import { ParsedModel, InferenceResult } from '@/types/api-spec';

interface ModelExplorerProps {
  models: ParsedModel[];
  inferences?: InferenceResult[];
  onModelUpdate?: (modelName: string, updates: Partial<ParsedModel>) => void;
  onInferenceAction?: (inference: InferenceResult, action: 'accept' | 'reject' | 'override', value?: any) => void;
  className?: string;
}

export const ModelExplorer: React.FC<ModelExplorerProps> = ({
  models,
  inferences = [],
  onModelUpdate,
  onInferenceAction,
  className = '',
}) => {
  const [selectedModel, setSelectedModel] = useState<ParsedModel | null>(null);
  const [editingModel, setEditingModel] = useState<string | null>(null);
  const [showInferredOnly, setShowInferredOnly] = useState(false);

  // Filter models with inferences
  const modelsWithInferences = models.filter(model =>
    inferences.some(inf => inf.category === 'data_format' || inf.field.toLowerCase().includes('schema'))
  );

  const displayedModels = showInferredOnly ? modelsWithInferences : models;

  const getModelInferences = (modelName: string): InferenceResult[] => {
    return inferences.filter(inf =>
      inf.field.toLowerCase().includes(modelName.toLowerCase()) ||
      inf.category === 'data_format'
    );
  };

  const handleModelEdit = (modelName: string, updates: Partial<ParsedModel>) => {
    if (onModelUpdate) {
      onModelUpdate(modelName, updates);
    }
    setEditingModel(null);
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Data Models</h2>
          <p className="text-muted-foreground">
            Explore and manage your API data models with AI-powered insights
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Badge variant="outline">{models.length} total models</Badge>
          <Badge variant="outline">{modelsWithInferences.length} with inferences</Badge>
          <Button
            variant={showInferredOnly ? "default" : "outline"}
            size="sm"
            onClick={() => setShowInferredOnly(!showInferredOnly)}
          >
            {showInferredOnly ? 'Show All' : 'Show Inferred Only'}
          </Button>
        </div>
      </div>

      {/* Model Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {displayedModels.map((model, index) => (
          <ModelCard
            key={index}
            model={model}
            inferences={getModelInferences(model.name)}
            onSelect={() => setSelectedModel(model)}
            onEdit={() => setEditingModel(model.name)}
            onInferenceAction={onInferenceAction}
            isSelected={selectedModel?.name === model.name}
          />
        ))}
      </div>

      {/* Add New Model Button */}
      <Card className="border-dashed border-2 hover:border-primary cursor-pointer">
        <CardContent className="flex items-center justify-center py-8">
          <Button variant="outline" className="flex items-center space-x-2">
            <Plus className="w-4 h-4" />
            <span>Add New Model</span>
          </Button>
        </CardContent>
      </Card>

      {/* Model Detail Modal */}
      {selectedModel && (
        <ModelDetailModal
          model={selectedModel}
          inferences={getModelInferences(selectedModel.name)}
          onClose={() => setSelectedModel(null)}
          onUpdate={onModelUpdate}
          onInferenceAction={onInferenceAction}
        />
      )}

      {/* Edit Model Modal */}
      {editingModel && (
        <EditModelModal
          model={models.find(m => m.name === editingModel)!}
          onSave={(updates) => handleModelEdit(editingModel, updates)}
          onCancel={() => setEditingModel(null)}
        />
      )}
    </div>
  );
};

// Model Card Component
interface ModelCardProps {
  model: ParsedModel;
  inferences: InferenceResult[];
  onSelect: () => void;
  onEdit: () => void;
  onInferenceAction?: (inference: InferenceResult, action: 'accept' | 'reject' | 'override', value?: any) => void;
  isSelected: boolean;
}

const ModelCard: React.FC<ModelCardProps> = ({
  model,
  inferences,
  onSelect,
  onEdit,
  onInferenceAction,
  isSelected,
}) => {
  const propertyCount = model.schema.properties ? Object.keys(model.schema.properties).length : 0;
  const requiredCount = model.schema.required?.length || 0;

  const getTypeColor = (type: string) => {
    const colors = {
      object: 'bg-blue-100 text-blue-800',
      array: 'bg-green-100 text-green-800',
      string: 'bg-yellow-100 text-yellow-800',
      number: 'bg-purple-100 text-purple-800',
      boolean: 'bg-red-100 text-red-800',
    };
    return colors[type as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  return (
    <Card
      className={`cursor-pointer transition-all hover:shadow-md ${
        isSelected ? 'ring-2 ring-primary' : ''
      }`}
      onClick={onSelect}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{model.name}</CardTitle>
          <div className="flex items-center space-x-2">
            {inferences.length > 0 && (
              <Badge variant="secondary" className="flex items-center space-x-1">
                <Zap className="w-3 h-3" />
                <span>{inferences.length}</span>
              </Badge>
            )}
            <Badge className={getTypeColor(model.schema.type)}>
              {model.schema.type}
            </Badge>
          </div>
        </div>
        {model.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {model.description}
          </p>
        )}
      </CardHeader>

      <CardContent className="pt-0">
        <div className="grid grid-cols-2 gap-4 mb-3 text-sm">
          <div>
            <span className="text-muted-foreground">Properties:</span>
            <span className="ml-2 font-medium">{propertyCount}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Required:</span>
            <span className="ml-2 font-medium">{requiredCount}</span>
          </div>
        </div>

        {model.schema.properties && (
          <div className="space-y-1">
            {Object.entries(model.schema.properties)
              .slice(0, 3)
              .map(([name, prop]) => (
                <div key={name} className="flex items-center justify-between text-xs">
                  <span className="font-mono">{name}</span>
                  <Badge variant="outline" className="text-xs">
                    {prop.type}
                  </Badge>
                </div>
              ))}
            {Object.keys(model.schema.properties).length > 3 && (
              <p className="text-xs text-muted-foreground">
                +{Object.keys(model.schema.properties).length - 3} more properties
              </p>
            )}
          </div>
        )}

        {inferences.length > 0 && (
          <div className="mt-3 pt-3 border-t">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">AI Insights</span>
              <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onEdit(); }}>
                <Edit className="w-4 h-4" />
              </Button>
            </div>
            {inferences.slice(0, 1).map((inference, index) => (
              <InferenceBadge
                key={index}
                inference={inference}
                onAction={onInferenceAction}
                compact
              />
            ))}
          </div>
        )}

        <div className="flex space-x-2 mt-3">
          <Button variant="outline" size="sm" className="flex-1" onClick={(e) => { e.stopPropagation(); onSelect(); }}>
            View Details
          </Button>
          <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); onEdit(); }}>
            <Edit className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

// Model Detail Modal
interface ModelDetailModalProps {
  model: ParsedModel;
  inferences: InferenceResult[];
  onClose: () => void;
  onUpdate?: (modelName: string, updates: Partial<ParsedModel>) => void;
  onInferenceAction?: (inference: InferenceResult, action: 'accept' | 'reject' | 'override', value?: any) => void;
}

const ModelDetailModal: React.FC<ModelDetailModalProps> = ({
  model,
  inferences,
  onClose,
  onUpdate,
  onInferenceAction,
}) => {
  const [activeTab, setActiveTab] = useState<'properties' | 'inferences'>('properties');

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <span>{model.name}</span>
            <Badge variant="outline">{model.schema.type}</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {model.description && (
            <p className="text-muted-foreground">{model.description}</p>
          )}

          <div className="flex space-x-2">
            <Button
              variant={activeTab === 'properties' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveTab('properties')}
            >
              Properties ({model.schema.properties ? Object.keys(model.schema.properties).length : 0})
            </Button>
            <Button
              variant={activeTab === 'inferences' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveTab('inferences')}
            >
              AI Insights ({inferences.length})
            </Button>
          </div>

          {activeTab === 'properties' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <strong>Type:</strong> {model.schema.type}
                </div>
                <div>
                  <strong>Required Fields:</strong> {model.schema.required?.length || 0}
                </div>
                <div>
                  <strong>Nullable:</strong> {model.schema.nullable ? 'Yes' : 'No'}
                </div>
                <div>
                  <strong>Read Only:</strong> {model.schema.readOnly ? 'Yes' : 'No'}
                </div>
              </div>

              {model.schema.properties && (
                <div>
                  <h4 className="font-semibold mb-3">Properties</h4>
                  <div className="space-y-3">
                    {Object.entries(model.schema.properties).map(([name, prop]) => (
                      <PropertyCard
                        key={name}
                        name={name}
                        property={prop}
                        isRequired={model.schema.required?.includes(name) || false}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'inferences' && (
            <div className="space-y-4">
              {inferences.length > 0 ? (
                inferences.map((inference, index) => (
                  <InferenceCard
                    key={index}
                    inference={inference}
                    onAction={onInferenceAction}
                  />
                ))
              ) : (
                <p className="text-muted-foreground text-center py-8">
                  No AI insights available for this model
                </p>
              )}
            </div>
          )}

          <div className="flex justify-end space-x-2 pt-4 border-t">
            {onUpdate && (
              <Button variant="outline" onClick={() => onUpdate(model.name, {})}>
                Edit Model
              </Button>
            )}
            <Button onClick={onClose}>Close</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// Property Card Component
interface PropertyCardProps {
  name: string;
  property: any;
  isRequired: boolean;
}

const PropertyCard: React.FC<PropertyCardProps> = ({ name, property, isRequired }) => {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-2">
            <span className="font-mono font-medium">{name}</span>
            {isRequired && <Badge variant="destructive" className="text-xs">Required</Badge>}
          </div>
          <Badge variant="outline">{property.type}</Badge>
        </div>

        {property.description && (
          <p className="text-sm text-muted-foreground mb-2">{property.description}</p>
        )}

        <div className="grid grid-cols-2 gap-4 text-xs text-muted-foreground">
          {property.format && (
            <div><strong>Format:</strong> {property.format}</div>
          )}
          {property.default !== undefined && (
            <div><strong>Default:</strong> {JSON.stringify(property.default)}</div>
          )}
          {property.enum && (
            <div className="col-span-2">
              <strong>Enum:</strong> {property.enum.join(', ')}
            </div>
          )}
          {property.pattern && (
            <div className="col-span-2">
              <strong>Pattern:</strong> {property.pattern}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

// Edit Model Modal
interface EditModelModalProps {
  model: ParsedModel;
  onSave: (updates: Partial<ParsedModel>) => void;
  onCancel: () => void;
}

const EditModelModal: React.FC<EditModelModalProps> = ({ model, onSave, onCancel }) => {
  const [editedModel, setEditedModel] = useState<Partial<ParsedModel>>({
    name: model.name,
    description: model.description,
  });

  const handleSave = () => {
    onSave(editedModel);
  };

  return (
    <Dialog open={true} onOpenChange={onCancel}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Model: {model.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Name</label>
            <Input
              value={editedModel.name || ''}
              onChange={(e) => setEditedModel(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Model name"
            />
          </div>

          <div>
            <label className="text-sm font-medium">Description</label>
            <Textarea
              value={editedModel.description || ''}
              onChange={(e) => setEditedModel(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Model description"
              rows={3}
            />
          </div>

          <div className="flex justify-end space-x-2 pt-4 border-t">
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button onClick={handleSave}>
              Save Changes
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// Inference Badge Component
interface InferenceBadgeProps {
  inference: InferenceResult;
  onAction?: (inference: InferenceResult, action: 'accept' | 'reject' | 'override', value?: any) => void;
  compact?: boolean;
}

const InferenceBadge: React.FC<InferenceBadgeProps> = ({ inference, onAction, compact = false }) => {
  if (compact) {
    return (
      <div className="flex items-center space-x-2">
        <Badge
          variant="secondary"
          className={`flex items-center space-x-1 ${getConfidenceColor(inference.confidence)}`}
        >
          {getConfidenceIcon(inference.confidence)}
          <span>{Math.round(inference.confidence * 100)}%</span>
        </Badge>
        <span className="text-sm text-muted-foreground">{inference.reasoning}</span>
      </div>
    );
  }

  return (
    <Card>
      <CardContent className="p-4">
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

        <p className="text-sm text-muted-foreground mb-2">{inference.reasoning}</p>

        {inference.alternatives && inference.alternatives.length > 0 && (
          <div>
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
      </CardContent>
    </Card>
  );
};

// Inference Card Component
interface InferenceCardProps {
  inference: InferenceResult;
  onAction?: (inference: InferenceResult, action: 'accept' | 'reject' | 'override', value?: any) => void;
}

const InferenceCard: React.FC<InferenceCardProps> = ({ inference, onAction }) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg capitalize">{inference.field}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            {getConfidenceIcon(inference.confidence)}
            <Badge className={getConfidenceColor(inference.confidence)}>
              {Math.round(inference.confidence * 100)}% Confidence
            </Badge>
          </div>

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

export default ModelExplorer;
