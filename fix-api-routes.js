const fs = require('fs');
const path = require('path');
const glob = require('glob');

const apiDir = path.join(__dirname, 'frontend/src/app/api');
const files = glob.sync(`${apiDir}/**/*.ts`);

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');

  // Check if supabase is initialized at the top level
  if (content.includes('const supabase = createClient(')) {
    // 1. Remove the global initialization
    content = content.replace(/const supabase = createClient\(\s*process\.env\.NEXT_PUBLIC_SUPABASE_URL!,\s*process\.env\.SUPABASE_SERVICE_ROLE_KEY!\s*\);/g, '');

    // 2. Add it inside the POST/GET handler
    const handlerRegex = /export async function (POST|GET)\([^)]*\)\s*{/g;
    content = content.replace(handlerRegex, (match) => {
      return `${match}\n  const supabase = createClient(\n    process.env.NEXT_PUBLIC_SUPABASE_URL!,\n    process.env.SUPABASE_SERVICE_ROLE_KEY!\n  );`;
    });
    
    // 3. Update any helper functions that use supabase (e.g., isSuperAdmin)
    // Pass supabase as an argument
    content = content.replace(/async function isSuperAdmin\(userId: string\)/g, 'async function isSuperAdmin(supabase: any, userId: string)');
    content = content.replace(/await isSuperAdmin\(user\.id\)/g, 'await isSuperAdmin(supabase, user.id)');

    fs.writeFileSync(file, content);
    console.log(`Updated ${file}`);
  }
}
