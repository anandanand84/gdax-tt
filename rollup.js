import { rollup } from 'rollup';
import babel from 'rollup-plugin-babel';
import uglify from 'rollup-plugin-uglify';
import nodeResolve from 'rollup-plugin-node-resolve';
import commonjs    from 'rollup-plugin-commonjs';

var fs = require('fs');

async function doBuild() {
  try {
      let bundle = await rollup({
      input: './build/src/browser.js',
      format: 'iife',
      external: [
        'ws',
        'socket.io-client',
        'stream'
      ],
      plugins: [
        babel({
          babelrc: false,
          "presets": [
            [
              "es2015",
              {
                "modules": false
              }
            ]
          ],
          "plugins": [
            "external-helpers"
          ]
        }),
        nodeResolve({
            jsnext : true
        }),
        commonjs({
          namedExports: {
            'node_modules/eventemitter3/index.js': [ 'EventEmitter' ],
            'node_modules/bintrees/index.js': [ 'RBTree', 'BinTree' ],
            'node_modules/immutable/dist/immutable.js' : ['Map', 'fromJS']
          }
        }),
        uglify()
      ]
    });

    bundle.write({
      'banner': '/* APP */',
      name: 'window',
      exports: 'named',
      file: 'dist/browser.js',
      globals : {
        'ws' : "WebSocket",
        'socket.io-client' : "io",
        'stream' : 'stream',
        'events':'events'
      },
      format : 'iife'
    })
    console.log('Completed browser build');
  } catch (e) {
    console.error(e);
    console.log(e.message);
  }

};

doBuild().then(console.log.bind(null, 'Completed build for node and browser'));