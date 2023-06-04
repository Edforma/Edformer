module.exports = {
  apps : [{
    name: "Edforma API",
    script: 'index.js',
    watch: '.',
    "env_production": {
      "NODE_ENV": "production",
      "PORT": 3000
    }
  }],

  deploy : {
    production : {
      user : 'griffin',
      host : 'unsec.griffinbauer.com',
      ref  : 'origin/v2',
      repo : 'https://github.com/Edforma/Edformer.git',
      path : '/home/griffin/pm2Data/Edforma',
      'pre-setup': "ls -la && pwd && uname -a && yarn --version",
      "pre-deploy-local": "echo Uploading ecosystem... && scp ecosystem.config.cjs griffin@unsec.griffinbauer.com:'/home/griffin/' && Configuration uploaded.",
      'post-deploy' : 'yarn && pm2 reload ~/ecosystem.config.cjs --env production',
      "env": {
        "SENTRY_DSN": "https://0577db8058fb43728025ccc85fc11439@o1069103.ingest.sentry.io/6065463",
        "SENTRY_TRACESAMPLERATE": 0.5,
        "SENTRY_TRACEPROFILERATE": 1.0,
        "SERVER_ANNOUNCEMENT": ""
      }
    }
  }
};
