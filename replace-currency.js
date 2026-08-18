const fs = require('fs');
const glob = require('glob');
const path = require('path');

const files = glob.sync('/Users/dileeppillai/Downloads/amrita_task/**/*.{ts,tsx,sql}', {
  ignore: ['**/node_modules/**', '**/dist/**', '**/.next/**']
});

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  let originalContent = content;

  // Replace default values in schemas and scripts
  content = content.replace(/'USD'/g, "'INR'");
  content = content.replace(/"USD"/g, '"INR"');
  content = content.replace(/USD \(\$\)/g, 'INR (₹)');
  content = content.replace(/placeholder="USD"/g, 'placeholder="INR"');

  if (content !== originalContent) {
    fs.writeFileSync(file, content);
    console.log(`Updated currency in ${path.basename(file)}`);
  }
}
