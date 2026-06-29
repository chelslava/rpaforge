/**
 * RPAForge IPC Schemas
 *
 * JSON Schema definitions for IPC validation.
 * Uses ajv for runtime validation.
 */

interface SchemaDefinition {
  $schema: string;
  $id: string;
  type: string;
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
}

const schemas: Record<string, SchemaDefinition> = {
  'bridge:send': {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'bridge:send',
    type: 'object',
    properties: {
      method: {
        type: 'string',
        pattern: '^[a-zA-Z0-9_.]+$',
        maxLength: 255,
      },
      params: {
        type: 'object',
        additionalProperties: true,
      },
    },
    required: ['method', 'params'],
    additionalProperties: false,
  },

  'engine:runProcess': {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'engine:runProcess',
    type: 'object',
    properties: {
      source: {
        type: 'string',
        maxLength: 1048576,
      },
      name: {
        type: 'string',
        minLength: 1,
        maxLength: 255,
      },
      sourcemap: {
        type: 'object',
        additionalProperties: { type: 'string' },
      },
    },
    required: ['source'],
    additionalProperties: false,
  },

  'engine:runFile': {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'engine:runFile',
    type: 'object',
    properties: {
      path: {
        type: 'string',
        minLength: 1,
        maxLength: 1024,
      },
    },
    required: ['path'],
    additionalProperties: false,
  },

  'engine:stopProcess': {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'engine:stopProcess',
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: false,
  },

  'engine:pauseProcess': {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'engine:pauseProcess',
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: false,
  },

  'engine:resumeProcess': {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'engine:resumeProcess',
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: false,
  },

  'engine:getCapabilities': {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'engine:getCapabilities',
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: false,
  },

  'engine:getActivities': {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'engine:getActivities',
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: false,
  },

  'debugger:setBreakpoint': {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'debugger:setBreakpoint',
    type: 'object',
    properties: {
      file: {
        type: 'string',
        minLength: 1,
        maxLength: 1024,
      },
      line: {
        type: 'integer',
        minimum: 1,
        maximum: 2147483647,
      },
      condition: {
        type: 'string',
        maxLength: 255,
      },
    },
    required: ['file', 'line'],
    additionalProperties: false,
  },

  'debugger:removeBreakpoint': {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'debugger:removeBreakpoint',
    type: 'object',
    properties: {
      id: {
        type: 'string',
        minLength: 1,
        maxLength: 255,
      },
    },
    required: ['id'],
    additionalProperties: false,
  },

  'debugger:toggleBreakpoint': {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'debugger:toggleBreakpoint',
    type: 'object',
    properties: {
      id: {
        type: 'string',
        minLength: 1,
        maxLength: 255,
      },
    },
    required: ['id'],
    additionalProperties: false,
  },

  'debugger:getBreakpoints': {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'debugger:getBreakpoints',
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: false,
  },

  'debugger:stepOver': {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'debugger:stepOver',
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: false,
  },

  'debugger:stepInto': {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'debugger:stepInto',
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: false,
  },

  'debugger:stepOut': {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'debugger:stepOut',
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: false,
  },

  'debugger:continue': {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'debugger:continue',
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: false,
  },

  'debugger:getVariables': {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'debugger:getVariables',
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: false,
  },

  'debugger:getCallStack': {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'debugger:getCallStack',
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: false,
  },

  'fs:pathExists': {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'fs:pathExists',
    type: 'object',
    properties: {
      path: {
        type: 'string',
        minLength: 1,
        maxLength: 1024,
      },
    },
    required: ['path'],
    additionalProperties: false,
  },

  'fs:readDir': {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'fs:readDir',
    type: 'object',
    properties: {
      dirPath: {
        type: 'string',
        minLength: 1,
        maxLength: 1024,
      },
    },
    required: ['dirPath'],
    additionalProperties: false,
  },

  'fs:readFile': {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'fs:readFile',
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        minLength: 1,
        maxLength: 1024,
      },
    },
    required: ['filePath'],
    additionalProperties: false,
  },

  'fs:writeFile': {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'fs:writeFile',
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        minLength: 1,
        maxLength: 1024,
      },
      content: {
        type: 'string',
        maxLength: 1048576,
      },
    },
    required: ['filePath', 'content'],
    additionalProperties: false,
  },

  'fs:createDir': {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'fs:createDir',
    type: 'object',
    properties: {
      dirPath: {
        type: 'string',
        minLength: 1,
        maxLength: 1024,
      },
    },
    required: ['dirPath'],
    additionalProperties: false,
  },

  'fs:delete': {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'fs:delete',
    type: 'object',
    properties: {
      targetPath: {
        type: 'string',
        minLength: 1,
        maxLength: 1024,
      },
      recursive: {
        type: 'boolean',
      },
    },
    required: ['targetPath'],
    additionalProperties: false,
  },

  'fs:rename': {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'fs:rename',
    type: 'object',
    properties: {
      oldPath: {
        type: 'string',
        minLength: 1,
        maxLength: 1024,
      },
      newPath: {
        type: 'string',
        minLength: 1,
        maxLength: 1024,
      },
    },
    required: ['oldPath', 'newPath'],
    additionalProperties: false,
  },

  'fs:copy': {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'fs:copy',
    type: 'object',
    properties: {
      source: {
        type: 'string',
        minLength: 1,
        maxLength: 1024,
      },
      destination: {
        type: 'string',
        minLength: 1,
        maxLength: 1024,
      },
    },
    required: ['source', 'destination'],
    additionalProperties: false,
  },

  'fs:openWithSystem': {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'fs:openWithSystem',
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        minLength: 1,
        maxLength: 1024,
      },
    },
    required: ['filePath'],
    additionalProperties: false,
  },

  'fs:showInFolder': {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'fs:showInFolder',
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        minLength: 1,
        maxLength: 1024,
      },
    },
    required: ['filePath'],
    additionalProperties: false,
  },

  'fs:getFileInfo': {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'fs:getFileInfo',
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        minLength: 1,
        maxLength: 1024,
      },
    },
    required: ['filePath'],
    additionalProperties: false,
  },

  'fs:watchDir': {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'fs:watchDir',
    type: 'object',
    properties: {
      dirPath: {
        type: 'string',
        minLength: 1,
        maxLength: 1024,
      },
    },
    required: ['dirPath'],
    additionalProperties: false,
  },

  'fs:unwatchDir': {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'fs:unwatchDir',
    type: 'object',
    properties: {
      dirPath: {
        type: 'string',
        minLength: 1,
        maxLength: 1024,
      },
    },
    required: ['dirPath'],
    additionalProperties: false,
  },

  'fs:setProjectRoot': {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'fs:setProjectRoot',
    type: 'object',
    properties: {
      rootPath: {
        type: 'string',
        minLength: 1,
        maxLength: 1024,
      },
    },
    required: ['rootPath'],
    additionalProperties: false,
  },

  'dialog:showOpen': {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'dialog:showOpen',
    type: 'object',
    properties: {
      title: { type: 'string', maxLength: 255 },
      defaultPath: { type: 'string', maxLength: 1024 },
      filters: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', maxLength: 100 },
            extensions: { type: 'array', items: { type: 'string' } },
          },
          required: ['name', 'extensions'],
        },
      },
      properties: {
        type: 'array',
        items: { type: 'string' },
      },
    },
    additionalProperties: false,
  },

  'dialog:showSave': {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'dialog:showSave',
    type: 'object',
    properties: {
      title: { type: 'string', maxLength: 255 },
      defaultPath: { type: 'string', maxLength: 1024 },
      filters: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', maxLength: 100 },
            extensions: { type: 'array', items: { type: 'string' } },
          },
          required: ['name', 'extensions'],
        },
      },
    },
    additionalProperties: false,
  },

  'spy_start': {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'spy_start',
    type: 'object',
    properties: {
      mode: {
        type: 'string',
        enum: ['web', 'desktop'],
      },
    },
    required: ['mode'],
    additionalProperties: false,
  },

  'spy_stop': {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'spy_stop',
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: false,
  },

  'spy:getElementAtMouse': {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'spy:getElementAtMouse',
    type: 'object',
    properties: {
      mode: {
        type: 'string',
        enum: ['web', 'desktop'],
      },
    },
    required: ['mode'],
    additionalProperties: false,
  },

  'spy:getMousePosition': {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'spy:getMousePosition',
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: false,
  },

  'ai:generateDiagram': {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'ai:generateDiagram',
    type: 'object',
    properties: {
      requestId: {
        type: 'string',
        minLength: 1,
        maxLength: 255,
      },
      providerId: {
        type: 'string',
        enum: ['openai-compatible', 'anthropic'],
      },
      prompt: {
        type: 'string',
        minLength: 1,
        maxLength: 10000,
      },
      activities: {
        type: 'array',
        maxItems: 2000,
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', maxLength: 255 },
            name: { type: 'string', maxLength: 255 },
            category: { type: 'string', maxLength: 255 },
            description: { type: 'string', maxLength: 2000 },
            params: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string', maxLength: 255 },
                  required: { type: 'boolean' },
                  hasDefault: { type: 'boolean' },
                },
                required: ['name', 'required', 'hasDefault'],
              },
            },
          },
          required: ['id', 'name', 'category', 'description', 'params'],
        },
      },
    },
    required: ['requestId', 'providerId', 'prompt', 'activities'],
    additionalProperties: false,
  },

  'ai:cancelGenerate': {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'ai:cancelGenerate',
    type: 'object',
    properties: {
      requestId: {
        type: 'string',
        minLength: 1,
        maxLength: 255,
      },
    },
    required: ['requestId'],
    additionalProperties: false,
  },

  'ai:setProviderKey': {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'ai:setProviderKey',
    type: 'object',
    properties: {
      provider: {
        type: 'string',
        enum: ['openai-compatible', 'anthropic'],
      },
      apiKey: {
        type: 'string',
        minLength: 1,
        maxLength: 4096,
      },
      baseUrl: {
        type: 'string',
        maxLength: 1024,
      },
      model: {
        type: 'string',
        maxLength: 255,
      },
    },
    required: ['provider', 'apiKey'],
    additionalProperties: false,
  },

  'ai:removeProviderKey': {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'ai:removeProviderKey',
    type: 'object',
    properties: {
      provider: {
        type: 'string',
        enum: ['openai-compatible', 'anthropic'],
      },
    },
    required: ['provider'],
    additionalProperties: false,
  },

  'ai:testProvider': {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'ai:testProvider',
    type: 'object',
    properties: {
      provider: {
        type: 'string',
        enum: ['openai-compatible', 'anthropic'],
      },
    },
    required: ['provider'],
    additionalProperties: false,
  },

  'ai:getProviderStatus': {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'ai:getProviderStatus',
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: false,
  },

  'git:isRepo': {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'git:isRepo',
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: false,
  },

  'git:init': {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'git:init',
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: false,
  },

  'git:status': {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'git:status',
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: false,
  },

  'git:stage': {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'git:stage',
    type: 'object',
    properties: {
      paths: {
        type: 'array',
        maxItems: 500,
        items: { type: 'string', minLength: 1, maxLength: 1024 },
      },
    },
    required: ['paths'],
    additionalProperties: false,
  },

  'git:unstage': {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'git:unstage',
    type: 'object',
    properties: {
      paths: {
        type: 'array',
        maxItems: 500,
        items: { type: 'string', minLength: 1, maxLength: 1024 },
      },
    },
    required: ['paths'],
    additionalProperties: false,
  },

  'git:commit': {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'git:commit',
    type: 'object',
    properties: {
      message: {
        type: 'string',
        minLength: 1,
        maxLength: 5000,
      },
    },
    required: ['message'],
    additionalProperties: false,
  },

  'git:push': {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'git:push',
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: false,
  },

  'git:pull': {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'git:pull',
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: false,
  },

  'git:log': {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'git:log',
    type: 'object',
    properties: {
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 1000,
      },
    },
    required: [],
    additionalProperties: false,
  },

  'git:diff': {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'git:diff',
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        minLength: 1,
        maxLength: 1024,
      },
      staged: {
        type: 'boolean',
      },
    },
    required: ['filePath', 'staged'],
    additionalProperties: false,
  },

  'git:currentBranch': {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'git:currentBranch',
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: false,
  },

  'git:discardChanges': {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'git:discardChanges',
    type: 'object',
    properties: {
      paths: {
        type: 'array',
        maxItems: 500,
        items: { type: 'string', minLength: 1, maxLength: 1024 },
      },
    },
    required: ['paths'],
    additionalProperties: false,
  },

  'git:getRemoteUrl': {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'git:getRemoteUrl',
    type: 'object',
    properties: {
      name: {
        type: 'string',
        minLength: 1,
        maxLength: 255,
      },
    },
    required: [],
    additionalProperties: false,
  },

  'git:setRemoteUrl': {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'git:setRemoteUrl',
    type: 'object',
    properties: {
      url: {
        type: 'string',
        minLength: 1,
        maxLength: 2048,
      },
      name: {
        type: 'string',
        minLength: 1,
        maxLength: 255,
      },
    },
    required: ['url'],
    additionalProperties: false,
  },

  'libraries:install': {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'libraries:install',
    type: 'object',
    properties: {
      pypiPackage: {
        type: 'string',
        minLength: 1,
        maxLength: 255,
        pattern: '^[a-zA-Z0-9._\\-\\[\\],]+$',
      },
    },
    required: ['pypiPackage'],
    additionalProperties: false,
  },

  'libraries:uninstall': {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'libraries:uninstall',
    type: 'object',
    properties: {
      pypiPackage: {
        type: 'string',
        minLength: 1,
        maxLength: 255,
        pattern: '^[a-zA-Z0-9._\\-\\[\\],]+$',
      },
    },
    required: ['pypiPackage'],
    additionalProperties: false,
  },

  'libraries:refresh': {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'libraries:refresh',
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
};

export { schemas };