# To-ducks

A minimalist task list that gives you a duck whenever you finish a task.
The app runs in your browser; GitHub Pages serves the built files.

## Local development

Use Node.js 24 (also recorded in `.nvmrc`).

```sh
npm ci
npm run dev
```

Run `npm test` for the regression suite, `npm run build` to generate `dist/`,
and `npm run preview` to preview the production build.

## Deploy to teuncm.nl

1. Push this project, including `.github/workflows/pages.yml`, to GitHub.
2. Open **Settings → Pages** and select **GitHub Actions** as the source.
3. In the same settings, set **Custom domain** to `teuncm.nl` and save it.
   The domain is configured in GitHub settings; custom Actions deployments do
   not use a `CNAME` file to configure it.
4. At your DNS provider, point the apex domain (`@`) to GitHub Pages using
   these four A records:

   | Type | Name | Value |
   | --- | --- | --- |
   | A | @ | 185.199.108.153 |
   | A | @ | 185.199.109.153 |
   | A | @ | 185.199.110.153 |
   | A | @ | 185.199.111.153 |

   If you also want `www.teuncm.nl`, add a CNAME for `www` pointing to your
   account's `<username>.github.io` hostname, without a repository path.
5. Once GitHub's DNS check passes and a certificate is available, enable
   **Enforce HTTPS** in Pages settings.
6. Push to the default branch, or run **Test and deploy to GitHub Pages**
   manually from that branch in the Actions tab.

The workflow installs locked dependencies, runs tests, builds, and deploys
`dist/` using GitHub's built-in token. Pull requests and other branches run
checks without deploying. The default branch and published URL are resolved
from GitHub metadata, so neither the repository name nor branch name is
hardcoded in the workflow. Pages environment protection rules must permit
deployment from the repository's default branch.

Assets and the web app manifest use relative paths, so the same build works
at `https://teuncm.nl/` and under a GitHub Pages repository path.

## Saved tasks

Tasks, ducks, positions, and theme are saved on the current browser and
origin. They do not sync across devices. Before moving from localhost or
another domain to `teuncm.nl`, use **Settings → Export**, then **Import** on
the new domain to bring your collection with you.

GitHub references:
[custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages),
[custom domains and DNS](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site).
