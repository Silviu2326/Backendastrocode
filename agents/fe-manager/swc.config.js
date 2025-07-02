module.exports = {
  jsc: {
    parser: {
      syntax: 'typescript',
      tsx: false,
      decorators: true,
      dynamicImport: true
    },
    target: 'es2020',
    loose: false,
    externalHelpers: false,
    keepClassNames: true,
    preserveAllComments: true,
    transform: {
      legacyDecorator: true,
      decoratorMetadata: true,
      react: {
        runtime: 'automatic'
      }
    },
    experimental: {
      plugins: []
    }
  },
  module: {
    type: 'commonjs',
    strict: false,
    strictMode: true,
    lazy: false,
    noInterop: false
  },
  minify: false,
  sourceMaps: true,
  inlineSourcesContent: true,
  env: {
    targets: {
      node: '18'
    },
    mode: 'usage',
    coreJs: '3.30'
  },
  exclude: [
    'node_modules',
    'dist',
    'test',
    '**/*.test.ts',
    '**/*.spec.ts'
  ]
};