const { execSync } = require('child_process');
const cwd = 'D:\\restuarentbackendbeforenotification';

try {
  console.log('Staging server.js...');
  execSync('git add server.js', { cwd, stdio: 'inherit' });

  console.log('Committing changes...');
  execSync('git commit -m "Fix order prep status sync for acceptedbyrestorents collection"', { cwd, stdio: 'inherit' });

  console.log('Pushing to origin main...');
  const pushOut = execSync('git push origin main', { cwd }).toString();
  console.log(pushOut);
  console.log('Git commit and push completed successfully.');
} catch (e) {
  console.error('Error during git execution:', e.message);
}
