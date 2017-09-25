import builtins from 'rollup-plugin-node-builtins';
import babel from 'rollup-plugin-babel';
import uglify from 'rollup-plugin-uglify';
import nodeResolve from 'rollup-plugin-node-resolve';
import commonjs    from 'rollup-plugin-commonjs';
import replace from 'rollup-plugin-replace'

export default {
  input: 'build/src/browser.js',
  dest : 'dist/browser.js',
  format: 'iife',
  moduleName : 'window',
  external: [
    'state-manager',
    'socket.io-client'
  ],
  globals : {
    'state-manager' : "StateManager",
    'socket.io-client' : "io",
  },
//   onwarn: function(warning) {
//     if ( warning.code === 'THIS_IS_UNDEFINED' ) { return; }
//     console.warn( warning.message );
//   },
  plugins: [
    builtins(),
    replace({
      'process.env.NODE_ENV': JSON.stringify('production')
    }),
    nodeResolve({
        jsnext : true
    }),
    commonjs({
      namedExports: {
        'node_modules/bintrees/index.js': [ 'RBTree' ],
        'node_modules/bignumber.js/bignumber.js': [ 'another' ]
      }
    })
    // babel({
    //   babelrc:false,
    //   "presets": [
    //     [
    //       "es2015",
    //       {
    //         "modules": false
    //       }
    //     ]
    //   ]
    // }),
    // uglify() 
  ]
};
