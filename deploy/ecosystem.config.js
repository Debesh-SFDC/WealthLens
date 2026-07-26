module.exports = {
  apps: [{
    name: 'wealthlens-server',
    script: 'src/server/index.js',
    env_production: {
      NODE_ENV: 'production',
      APP_MODE: 'web',
      PORT: 3001
    }
  }]
}
