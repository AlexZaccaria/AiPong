// "About": the story of the project and the choices behind it, for whoever opens the site, often
// someone looking at the author's work. Shown in the sheet over the game (the sheet's title is the
// page heading, so sections start at h2). One link only, to the code.

import { t } from '../i18n/i18n.js';
import { html, render } from './html.js';
import { icon } from './icons.js';
import { PROJECT } from '../project.js';

const external = (size = 13) => icon('external-link', size, 'muted-icon');

export function renderAbout(element) {
  const a = t().about;
  const links = t().links;
  render(
    element,
    html`<article class="about">
      <header class="card about-hero">
        <p class="eyebrow">${a.eyebrow}</p>
        <h2 class="hero-title">${a.title}</h2>
        <p class="lead">${a.intro}</p>
        <p class="byline">${a.author(PROJECT.author)}</p>
        <div class="actions">
          <a class="btn btn-primary" href="${PROJECT.repoUrl}" target="_blank" rel="noopener">${icon('code')}${links.repo}${external()}</a>
        </div>
        <div class="palette-strip" aria-hidden="true">${Array.from({ length: 8 }, () => html`<span></span>`)}</div>
      </header>

      <div class="about-split">
        <section class="card panel" aria-labelledby="about-story">
          <h3 id="about-story" class="panel-title">${icon('house', 17)}${a.storyTitle}</h3>
          ${a.story.map((p) => html`<p class="prose">${p}</p>`)}
        </section>
        <section class="card panel" aria-labelledby="about-what">
          <h3 id="about-what" class="panel-title">${a.whatTitle}</h3>
          <ul class="features">
            ${a.what.map(
              (w) => html`<li>
                <span class="feature-icon">${icon(w.icon, 17)}</span>
                <span><span class="feature-title">${w.title}</span><span class="feature-body">${w.body}</span></span>
              </li>`,
            )}
          </ul>
        </section>
      </div>

      <section class="card panel" aria-labelledby="about-stack">
        <h3 id="about-stack" class="panel-title">${a.stackTitle}</h3>
        <p class="panel-intro">${a.stackIntro}</p>
        <div class="stack">
          ${a.stack.map(
            (g) => html`<div>
              <h4>${icon(g.icon, 15, 'muted-icon')}${g.group}</h4>
              <ul class="chips">${g.items.map((item) => html`<li class="chip">${item}</li>`)}</ul>
            </div>`,
          )}
        </div>
      </section>

      <section class="card panel" aria-labelledby="about-choices">
        <h3 id="about-choices" class="panel-title">${a.choicesTitle}</h3>
        <ul class="tiles-3">
          ${a.choices.map(
            (c) => html`<li class="tile">
              <span class="tile-title">${icon(c.icon, 16, 'muted-icon')}${c.title}</span>
              <span class="tile-body">${c.body}</span>
            </li>`,
          )}
        </ul>
      </section>

      <section class="card panel" aria-labelledby="about-license">
        <h3 id="about-license" class="panel-title">${icon('scale', 17)}${a.licenseTitle}</h3>
        <p class="prose">${a.licenseBody}</p>
      </section>
    </article>`,
  );
}
