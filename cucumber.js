module.exports = {
  default: {
    paths: ['tests/e2e/features/**/*.feature'],
    require: ['tests/e2e/support/*.js', 'tests/e2e/steps/*.js'],
    format: [
      'progress-bar',
      'html:reports/e2e/cucumber-report.html',
      'json:reports/e2e/cucumber-report.json',
      'junit:reports/e2e/cucumber-junit.xml',
    ],
  },
};
