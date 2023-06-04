module.exports = {
  apps : [{
    name: "Edforma API",
    script: 'index.js',
    watch: '.'
  }],

  deploy : {
    production : {
      user : 'griffin',
      host : 'unsec.griffinbauer.com',
      ref  : 'origin/v2',
      repo : 'https://github.com/Edforma/Edformer.git',
      path : '/home/griffin/pm2Data/Edforma',
      'pre-setup': "ls -la && pwd && uname -a && yarn --version",
      'post-deploy' : 'yarn && pm2 reload ecosystem.config.cjs --env production'
    }
  }
};
