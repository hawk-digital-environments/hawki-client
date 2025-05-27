import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import babel from '@rollup/plugin-babel';
import terser from '@rollup/plugin-terser';
import dts from 'rollup-plugin-dts';
import pkg from './package.json' assert { type: 'json' };

// List of dependencies that should be treated as external modules
const external = [
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.peerDependencies || {})
];

// Common plugins for all builds
const plugins = [
  resolve(),
  commonjs(),
  babel({
    babelHelpers: 'bundled',
    presets: [
      ['@babel/preset-env', { targets: { node: '14', browsers: pkg.browserslist } }]
    ],
    exclude: 'node_modules/**'
  })
];

export default [
  // ESM build
  {
    input: 'src/index.js',
    output: {
      file: pkg.module,
      format: 'esm',
      exports: 'named',
      sourcemap: true
    },
    external,
    plugins
  },
  
  // CommonJS build
  {
    input: 'src/index.js',
    output: {
      file: pkg.main,
      format: 'cjs',
      exports: 'named',
      sourcemap: true
    },
    external,
    plugins
  },
  
  // UMD build (minified for browsers)
  {
    input: 'src/index.js',
    output: {
      file: 'dist/hawki-chat-client.min.js',
      format: 'umd',
      name: 'HAWKIChat',
      exports: 'named',
      sourcemap: true,
      globals: {
        'laravel-echo': 'Echo',
        'pusher-js': 'Pusher',
        'pako': 'pako'
      }
    },
    external: ['laravel-echo', 'pusher-js', 'pako'],
    plugins: [
      ...plugins,
      terser()
    ]
  },
  
  // TypeScript declarations
  {
    input: 'src/index.d.ts',
    output: {
      file: pkg.types,
      format: 'es'
    },
    plugins: [dts()]
  }
];