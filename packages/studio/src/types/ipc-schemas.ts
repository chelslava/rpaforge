/**
 * RPAForge IPC Schemas
 *
 * JSON Schema definitions for IPC validation.
 * Uses ajv for runtime validation.
 */

// Base schema structure
interface SchemaDefinition {
  $schema: string;
  $id: string;
  type: string;
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
}

// IPC Method Schemas
const schemas: Record<string, SchemaDefinition> = {
  // Bridge API schemas
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

  // Engine API schemas
  'engine:runProcess': {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'engine:runProcess',
    type: 'object',
    properties: {
      source: {
        type: 'string',
        maxLength: 1048576, // 1MB limit
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

  // Debugger API schemas
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

  // File System API schemas
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
        maxLength: 1048576, // 1MB limit
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
};

export { schemas };
