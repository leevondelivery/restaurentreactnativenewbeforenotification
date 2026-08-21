const fs = require('fs');
const path = 'D:\\restuarentbackendbeforenotification\\server.js';

let code = fs.readFileSync(path, 'utf8');

// Remove the fallback block in GET payments endpoint that populated fake transactions from acceptedbyrestorents
const fallbackRegex = /\s*\}\s*else\s*\{\s*\/\/\s*Fallback:\s*Compute from acceptedbyrestorents collection[\s\S]*?res\.json\(\{/m;

if (fallbackRegex.test(code)) {
  code = code.replace(fallbackRegex, '\n    }\n\n    res.json({');
  fs.writeFileSync(path, code, 'utf8');
  console.log('Successfully removed acceptedbyrestorents fallback from GET payments route in server.js!');
} else {
  console.log('Fallback regex not matched directly in server.js');
}
