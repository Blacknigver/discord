console.log('Node.js version:', process.version); console.log('Module format:', JSON.stringify(require.main.filename, null, 2)); console.log('ESM mode:', JSON.stringify(process.execArgv, null, 2));
