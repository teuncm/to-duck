# to-duck

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

Tasks, ducks, positions, task history, and theme are saved on the current browser and
origin. They do not sync across devices. Before moving from localhost or
another domain to `teuncm.nl`, use **Settings → Export**, then **Import** on
the new domain to bring your collection with you.

## Typing assistance

Previously entered to-ducks are always suggested instantly and take priority over
AI. Suggestions are ranked by recency, frequency, and familiar task sequences.
The last two or three entered tasks distinguish similar routines; if no longer
sequence matches, suggestions fall back to a single preceding task. For example,
after repeating Wash → Dry → Fold, entering Wash again brings Dry forward. The last 256 submitted tasks are retained as
local sequence history, including repetitions; distinct task history is capped
at 200 names.

For unfamiliar text, a tiny bundled English n-gram model offers instant inline
continuations using up to three words of context. Saved task history and repeated
tasks receive extra weight. Confident transitions can complete multiple words;
uncertain predictions stop after a short continuation. Everything runs synchronously on the device, with no
model downloads, workers, external runtime, accounts, or API calls.

Previous-task suggestions tolerate small spelling mistakes, including swapped
letters. Exact prefix matches remain first. Typo matches never silently rewrite
the input or appear as inline corrections: select one explicitly to use it.

Select a previous task with arrows and Enter, or click it. Tab accepts an inline
continuation or the highlighted history suggestion; Enter adds the task. Escape
dismisses assistance. Shift+Tab keeps normal navigation. Clear All clears both
distinct history and repeated task sequences.

GitHub references:
[custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages),
[custom domains and DNS](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site).
