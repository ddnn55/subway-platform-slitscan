module.exports = {
    entry: "./index",
    output: {
        path: __dirname,
        filename: "bundle.js"
    },
    devtool: 'source-map',
    module: {
        loaders: [
          {
            test: /.jsx?$/,
            loader: 'babel-loader',
            exclude: /node_modules/,
            query: {
              presets: ['latest']
            }
          }
        ]
    },
    resolve: {
        extensions: [".js", ".jsx"]
    }
};
