# install and deploy backend
git pull origin master
npm i
npm audit fix --force

echo "\n\nInstalled Backend Requirements.. generating artifacts"
npx prisma generate
npx prisma migrate deploy

echo "\n\nBuilding the project is enough, cause pm2 is watching for changes"
npm run build

sudo systemctl restart nginx
echo "\n\nDeployments done..."
