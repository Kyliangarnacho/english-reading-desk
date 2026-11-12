'use strict';
(() => {
  const $ = (s, root = document) => root.querySelector(s);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon = name => `<img src="./vendor/icons/${name}.svg" alt="" aria-hidden="true">`;
  const safeURL = value => { try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) ? esc(u.href) : '#'; } catch { return '#'; } };
  const readStore = (key, fallback) => { try { return JSON.parse(localStorage.getItem('english-desk-' + key)) ?? fallback; } catch { return fallback; } };
  const writeStore = (key, value) => { try { localStorage.setItem('english-desk-' + key, JSON.stringify(value)); } catch { toast('浏览器暂时无法保存设置，本次仍可正常阅读'); } };
  let data = window.ENGLISH_DESK_CONTENT;
  const state = { saved: new Set(readStore('saved', [])), font: readStore('font', 22), theme: readStore('theme', 'paper'), kind: 'sentences', query: '', limit: 12, priority: false, fragments: false, color: true, readerStructure: false, readerTranslation: false, paragraphTranslation: new Set(), paragraphStructure: new Set() };
  let toastTimer;
  const toast = message => { const node = $('#toast'); node.textContent = message; node.classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => node.classList.remove('visible'), 2800); };
  const formatSource = value => (Array.isArray(value) ? value.join('；') : value || '').replace(/考研英语每日训练_2026-/g, '训练 ').replace(/_星期[一二三四五六日]/g, '').replace(/_正式版/g, '').replace(/\.docx/g, '');
  const counts = () => ({sentences: data.sentences.filter(s => s.status === 'sentence').length, words: data.lexicon.filter(w => w.kind === 'word').length, phrases: data.lexicon.filter(w => w.kind === 'phrase').length});
  const isSaved = key => state.saved.has(key);
  const saveButton = (key, label = '收藏') => `<button type="button" class="save-button" data-save="${esc(key)}" aria-label="${isSaved(key) ? '取消收藏' : label}" aria-pressed="${isSaved(key)}" title="${isSaved(key) ? '取消收藏' : label}">${icon('bookmark')}</button>`;
  const colored = (s, enabled = true) => enabled && s.segments?.length ? s.segments.map(x => `<span class="seg-${esc(x.role)}">${esc(x.text)}</span>`).join('') : esc(s.text);
  const colorKey = () => '<div class="color-key" aria-label="配色说明"><span>主干</span><span class="key-clause">从句与修饰</span><span class="key-aside">插入说明</span></div>';
  const sentenceCard = s => `<article class="sentence-card" id="${esc(s.id)}"><div class="sentence-top"><span><span class="sentence-id">${esc(s.id)}</span>${esc(s.type)}${s.status === 'fragment' ? ' · 结构片段' : ''}</span>${saveButton('sentence:' + s.id)}</div><p class="english sentence-text" lang="en">${colored(s, state.color)}</p><p class="translation">${esc(s.translation)}</p><details class="sentence-details"><summary>提示与出处</summary>${s.hint ? `<p>${esc(s.hint)}</p>` : ''}<p class="source">${esc(formatSource(s.source))}</p></details></article>`;
  const articleCard = a => `<article class="feature-story"><div class="article-kicker"><span class="topic-tag">${esc(a.topic)}</span><span>阅读 ${esc(a.id)}</span><span>${esc(a.publisher)}</span></div><h2>${esc(a.subtitle || a.title)}</h2><p class="story-english" lang="en">${esc(a.sourceTitle)}</p><div class="story-bottom"><span class="reading-meta">${a.wordCount} 词 · 约 ${a.minutes} 分钟<br>${a.notes.length} 处句子精读 · 不设题目</span><a class="btn-main" href="#article/${esc(a.slug)}">开始阅读 ${icon('arrow-right')}</a></div></article>`;
  function setContent(html) { $('#main').innerHTML = html; }
  function home() {
    const n = counts();
    const priority = data.sentences.filter(s => s.priority && s.status === 'sentence');
    const picks = priority.filter(s => s.text.length > 90).slice(0, 2);
    const latest = data.articles.at(-1);
    setContent(`<div class="page-heading"><div class="eyebrow">YOUR READING DESK</div><h1>开始今天的阅读</h1><p>2027 考研英语一 · 原文阅读与个人积累</p></div><div class="home-grid"><div>${latest ? articleCard(latest) : '<div class="feature-story">新的阅读即将加入。</div>'}</div><section class="collection-summary" aria-label="个人积累统计"><h2>我的积累</h2><div class="stat-row"><b>${n.sentences}</b><span>个完整句</span></div><div class="stat-row"><b>${n.words}</b><span>个生词</span></div><div class="stat-row"><b>${n.phrases}</b><span>个短语与表达</span></div><a class="subtle-link" href="#collection">打开全部积累 ${icon('arrow-up-right')}</a></section></div><div class="section-top"><div><h2>先读懂这两句</h2><p>从你的重点摘句中开始</p></div><a class="text-link" href="#collection/sentences">全部句子 ${icon('arrow-right')}</a></div>${colorKey()}${picks.map(sentenceCard).join('')}<div class="home-footnote">${icon('info')}<span>每条保留原句与直译，颜色帮助你抓住主干。需要时再打开提示。</span></div>`);
  }
  function reading() {
    const candidates = data.plan?.supplementarySources || [];
    setContent(`<div class="page-heading"><div class="eyebrow">READ & UNDERSTAND</div><h1>外刊阅读</h1><p>先读英文，按需查看结构与直译。每篇只关注少量值得理解的句子。</p></div><div class="reading-list">${[...data.articles].reverse().map(articleCard).join('')}</div><div class="section-top"><div><h2>接下来可以读什么</h2><p>备选原文，可直接阅读；精读稿按你的要求继续更新</p></div></div><div class="source-list">${candidates.map(s => `<article class="source-item"><small>${esc(s.publisher)} · ${esc(s.date)}</small><a href="${safeURL(s.url)}" target="_blank" rel="noopener noreferrer" lang="en">${esc(s.title)} ↗</a></article>`).join('')}</div><p class="muted" style="font-size:12px;margin-top:25px">你在聊天中说“来一篇阅读”，下一期就会按主题轮换加入这里。</p>`);
  }
  function collection(savedOnly = false) {
    const n = savedOnly ? {sentences:data.sentences.filter(s=>s.status==='sentence' && isSaved('sentence:'+s.id)).length,words:data.lexicon.filter(w=>w.kind==='word' && isSaved('lexicon:'+w.id)).length,phrases:data.lexicon.filter(w=>w.kind==='phrase' && isSaved('lexicon:'+w.id)).length} : counts();
    setContent(`<div class="page-heading"><div class="eyebrow">${savedOnly ? 'SAVED FOR LATER' : 'YOUR PERSONAL COLLECTION'}</div><h1>${savedOnly ? '我的收藏' : '个人积累'}</h1><p>${savedOnly ? '把想再读一遍的内容留在这里。收藏保存在当前浏览器。' : '来自你的学习笔记。句子、单词与短语，集中在同一个地方。'}</p></div><div class="collection-tools"><div class="segmented-control" role="group" aria-label="积累分类"><button type="button" data-kind="sentences" class="${state.kind === 'sentences' ? 'active' : ''}" aria-pressed="${state.kind === 'sentences'}">句子 ${n.sentences}</button><button type="button" data-kind="words" class="${state.kind === 'words' ? 'active' : ''}" aria-pressed="${state.kind === 'words'}">单词 ${n.words}</button><button type="button" data-kind="phrases" class="${state.kind === 'phrases' ? 'active' : ''}" aria-pressed="${state.kind === 'phrases'}">短语 ${n.phrases}</button>${savedOnly ? `<button type="button" data-kind="articles" class="${state.kind === 'articles' ? 'active' : ''}" aria-pressed="${state.kind === 'articles'}">文章</button>` : ''}</div><div class="search-line"><label class="search-box">${icon('search')}<input type="search" id="collection-search" autocomplete="off" placeholder="搜索英文或中文" aria-label="搜索英文或中文" value="${esc(state.query)}"></label>${!savedOnly ? `<button type="button" class="filter-chip ${state.priority ? 'active' : ''}" data-action="priority" aria-pressed="${state.priority}">重点优先</button>` : ''}</div></div><div id="collection-results"></div>`);
    collectionResults(savedOnly);
  }
  function collectionResults(savedOnly = location.hash.startsWith('#saved')) {
    const q = state.query.toLocaleLowerCase().trim();
    let all = state.kind === 'sentences' ? data.sentences.filter(s => s.status === (state.fragments ? 'fragment' : 'sentence')) : state.kind === 'articles' ? data.articles : data.lexicon.filter(w => w.kind === (state.kind === 'words' ? 'word' : 'phrase'));
    const key = x => state.kind === 'sentences' ? 'sentence:' + x.id : state.kind === 'articles' ? 'article:' + x.slug : 'lexicon:' + x.id;
    if (savedOnly) all = all.filter(x => isSaved(key(x)));
    if (state.priority && !savedOnly) all = all.filter(x => state.kind === 'sentences' ? x.priority : x.priority === 1);
    if (q) all = all.filter(x => [x.text, x.translation, x.type, x.term, x.meaning, x.example, x.title, x.subtitle, x.sourceTitle].filter(Boolean).join(' ').toLocaleLowerCase().includes(q));
    const visible = all.slice(0, state.limit);
    const toggleFragment = state.kind === 'sentences' ? `<button type="button" class="text-link" style="border:0;background:none;padding:0" data-action="fragments">${state.fragments ? '返回完整句' : '查看结构片段 9'}</button>` : '';
    let result = `<div class="result-caption"><span>${q ? '找到' : '共'} ${all.length} ${state.kind === 'sentences' ? (state.fragments ? '条结构片段' : '个句子') : state.kind === 'articles' ? '篇文章' : '项'}${state.priority && !savedOnly ? '重点内容' : ''}</span>${toggleFragment}</div>`;
    if (state.kind === 'sentences' && all.length) result += `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px">${colorKey()}<button type="button" class="text-link" style="background:none;border:0;padding:0" data-action="color">${state.color ? '只看原文' : '显示结构'}</button></div>`;
    if (!all.length) result += `<div class="empty-state"><h2>${q ? '没有找到对应内容' : savedOnly ? '这里还没有收藏' : '没有对应的内容'}</h2><p>${q ? '试试英文关键词，或换一个中文意思。' : savedOnly ? '点击句子、词语或文章旁的书签，就能留在这里。' : '可以关闭筛选，再看看全部积累。'}</p></div>`;
    else if (state.kind === 'sentences') result += visible.map(sentenceCard).join('');
    else if (state.kind === 'articles') result += visible.map(articleCard).join('');
    else result += `<div class="word-list">${visible.map(w => `<article class="word-row"><div class="word-heading"><div><span class="sentence-id">${esc(w.id.slice(2))}</span><span class="word-term" lang="en">${esc(w.term)}</span><span class="word-pos">${esc(w.pos || '')}</span></div>${saveButton('lexicon:' + w.id)}</div><p class="word-meaning">${esc(w.meaning)}</p>${w.example ? `<p class="word-example" lang="en">${esc(w.example)}</p>` : ''}${w.note ? `<p class="word-note">${esc(w.note)}</p>` : ''}<details class="sentence-details"><summary>出处</summary><p class="source">${esc(formatSource(w.source))}</p></details></article>`).join('')}</div>`;
    if (all.length > state.limit) result += `<button type="button" class="btn-quiet load-more" data-action="more">继续查看 ${Math.min(12, all.length - state.limit)} 项 ${icon('chevron-right')}</button>`;
    $('#collection-results').innerHTML = result;
  }
  function article(slug, keepScroll = false) {
    const a = data.articles.find(a => a.slug === slug);
    if (!a) { setContent('<div class="empty-state"><h1>这篇阅读暂未加入</h1><a href="#reading">返回阅读目录</a></div>'); return; }
    writeStore('last-article', slug);
    const oldScroll = window.scrollY;
    const hasStructure = i => state.readerStructure || state.paragraphStructure.has(i);
    const hasTranslation = i => state.readerTranslation || state.paragraphTranslation.has(i);
    const markedParagraph = (p, i) => {
      if (!hasStructure(i)) return esc(p.en);
      const notes = a.notes.filter(n => p.en.includes(n.text));
      let pos = 0, result = '';
      for (const note of notes.sort((x, y) => p.en.indexOf(x.text) - p.en.indexOf(y.text))) {
        const start = p.en.indexOf(note.text, pos);
        if (start < pos) continue;
        result += esc(p.en.slice(pos, start)) + colored(note); pos = start + note.text.length;
      }
      return result + esc(p.en.slice(pos));
    };
    setContent(`<article class="reader"><a href="#reading" class="back-link">${icon('chevron-left')} 返回阅读目录</a><div class="eyebrow">READING ${esc(a.id)} / ${esc(a.topic)}</div><h1>${esc(a.subtitle || a.title)}</h1><p class="article-subtitle" lang="en">${esc(a.sourceTitle)}</p><div class="reader-meta"><span>${esc(a.publisher)} · ${esc(a.date)}</span><span>${a.wordCount} 词 · 约 ${a.minutes} 分钟</span><a href="${safeURL(a.url)}" target="_blank" rel="noopener noreferrer">原文 ↗</a></div><p class="reader-intro">${esc(a.editorialNote)}</p><div class="reader-toolbar" role="group" aria-label="阅读方式"><button type="button" class="btn-quiet ${state.readerStructure ? 'active' : ''}" data-action="reader-structure" aria-pressed="${state.readerStructure}">结构标色</button><button type="button" class="btn-quiet ${state.readerTranslation ? 'active' : ''}" data-action="reader-translation" aria-pressed="${state.readerTranslation}">显示直译</button>${saveButton('article:' + a.slug, '收藏文章')}</div>${state.readerStructure ? colorKey() : ''}${a.paragraphs.map((p, i) => { const notes = a.notes.filter(n => p.en.includes(n.text)); return `<section class="article-paragraph"><span class="paragraph-no">${String(i + 1).padStart(2, '0')}</span><p class="english" lang="en">${markedParagraph(p, i)}</p>${hasTranslation(i) ? `<p class="paragraph-translation">${esc(p.zh)}</p>` : ''}<div class="paragraph-actions"><button type="button" data-paragraph-translation="${i}" aria-expanded="${hasTranslation(i)}">${hasTranslation(i) ? '收起直译' : '直译 ＋'}</button>${notes.length ? `<button type="button" data-paragraph-structure="${i}" aria-expanded="${hasStructure(i)}">${hasStructure(i) ? '收起结构' : '结构 ＋'}</button>` : ''}</div>${hasStructure(i) ? notes.map(n => `<details class="sentence-details"><summary>一句结构提示</summary><p class="note-hint">${esc(n.hint)}</p></details>`).join('') : ''}</section>`; }).join('')}<div class="end-marker">END OF READING</div><details class="sentence-details"><summary>读完再看一句提示</summary><p>${esc(a.readingHint || '')}</p></details><div class="section-top"><h2>几个值得记住的表达</h2></div><div class="reader-vocab">${(a.vocab || []).map(v => `<div><div class="term" lang="en">${esc(Array.isArray(v) ? v[0] : v.term)}</div><div class="meaning">${esc(Array.isArray(v) ? v[1] : v.meaning)}</div></div>`).join('')}</div><div class="article-license"><p>${esc((a.authors || []).join(' & '))} · ${esc(a.publisher)} · ${esc(a.date)}<br>${esc(a.sourceTitle)}<br>${esc(a.license)}<br><a href="${safeURL(a.doi || a.url)}" target="_blank" rel="noopener noreferrer">查看完整原作与许可 ↗</a></p></div><a href="#collection/sentences" class="btn-quiet">去复习我的句子 ${icon('arrow-right')}</a></article>`);
    if (keepScroll) window.scrollTo(0, oldScroll);
  }
  function about() {
    setContent(`<div class="page-heading"><div class="eyebrow">ABOUT THIS DESK</div><h1>按你的节奏阅读</h1><p>面向2027考研英语一的个人阅读空间</p></div><section class="about-section"><h2>怎样使用</h2><p>外刊先连续读英文，遇到难句时打开“结构”。深色是先抓的主干，蓝色是从句或依附修饰，橙色是插入说明。直译尽量帮助你对应英文的信息顺序。</p>${colorKey()}<p>个人积累按句子、单词、短语集中整理。需要深入理解时，打开条目下的短提示；读完后可以收藏，再回来复习。</p><h2>怎样更新</h2><p>在原来的聊天里说“来一篇阅读”，或补充新的笔记。更新内容并发布后，继续打开这个网址即可。右上角的刷新按钮用于检查已经发布的更新。</p><p>收藏、字号和背景保存在当前浏览器，暂不跨设备同步。文章和学习资料由网站统一提供，手机与电脑访问同一个内容版本。</p><h2>来源与选文</h2><p>选文参考2024至2026年英语一的阅读题材与论述方式，以长难句和文章理解为重点，不设选择题。主题轮换是学习安排，不代表命题预测。</p>${(data.plan?.rotation || []).map(t => `<span class="theme-pill">${esc(t.title)}</span>`).join('')}<p style="margin-top:15px">英文原作、节选和新增译文分别注明来源。首期为开放许可论文的两组节选，略偏学术；后续继续加入报刊和科普文章。</p><details class="sentence-details"><summary>查看已核验的真题原刊来源</summary><div class="source-list">${(data.plan?.originalSources || []).map(s => `<div class="source-item"><small>${s.exam.year} Text ${s.exam.text} · ${esc(s.publisher)} · ${esc(s.date)}</small><a href="${safeURL(s.alternateUrl || s.url)}" target="_blank" rel="noopener noreferrer" lang="en">${esc(s.title)} ↗</a><p style="font-size:10px;margin-top:7px">${esc(s.access)}</p></div>`).join('')}</div></details><h2>这个页面借用了什么</h2><p>基础样式使用 Bootstrap，图标来自 Lucide；阅读排版、句内结构与内容整理按你的学习需求调整。</p><p><a href="./vendor/BOOTSTRAP-LICENSE.txt" target="_blank" rel="noopener">Bootstrap MIT许可</a> · <a href="./vendor/LUCIDE-LICENSE.txt" target="_blank" rel="noopener">Lucide ISC许可</a></p><p class="muted">内容版本 ${esc(data.version)} · 更新于 ${esc(data.updatedAt)}</p></section>`);
  }
  function currentRoute() { const [page, id] = location.hash.replace(/^#/, '').split('/'); return {page: page || 'home', id}; }
  function route() {
    const {page, id} = currentRoute();
    const nav = page === 'article' ? 'reading' : page;
    document.querySelectorAll('[data-nav]').forEach(a => { a.classList.toggle('active', a.dataset.nav === nav); if (a.dataset.nav === nav) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    const title = {home:'阅读看板',reading:'外刊阅读',article:'外刊阅读',collection:'个人积累',saved:'我的收藏',about:'阅读说明'}[page] || '阅读看板';
    $('#breadcrumb').textContent = '我的学习空间 / ' + title;
    document.title = title + ' · 英语自学2027';
    if (page === 'article') article(id);
    else if (page === 'reading') reading();
    else if (page === 'collection' || page === 'saved') { if (['sentences','words','phrases','articles'].includes(id)) state.kind = id; if (state.kind === 'articles' && page !== 'saved') state.kind = 'sentences'; collection(page === 'saved'); }
    else if (page === 'about') about();
    else home();
    updateCounts();
  }
  function updateCounts() { $('#saved-count').textContent = state.saved.size; $('#article-count').textContent = data.articles.length; $('#update-date').textContent = '内容更新 ' + data.updatedAt.slice(5).replace('-', '.'); }
  function applySettings() {
    state.font = Math.min(28, Math.max(19, Number(state.font) || 22));
    if (!['paper','warm','night'].includes(state.theme)) state.theme = 'paper';
    document.documentElement.style.setProperty('--english-size', state.font + 'px');
    document.documentElement.dataset.theme = state.theme;
    $('#font-size').value = state.font; $('#font-value').textContent = state.font;
    document.querySelectorAll('[data-theme-choice]').forEach(b => b.classList.toggle('active', b.dataset.themeChoice === state.theme));
  }
  $('#main').addEventListener('click', event => {
    const save = event.target.closest('[data-save]');
    if (save) { const key = save.dataset.save; if (state.saved.has(key)) state.saved.delete(key); else state.saved.add(key); writeStore('saved', [...state.saved]); document.querySelectorAll('[data-save]').forEach(b => { if (b.dataset.save === key) { b.setAttribute('aria-pressed', isSaved(key)); b.setAttribute('aria-label', isSaved(key) ? '取消收藏' : '收藏'); b.title = isSaved(key) ? '取消收藏' : '收藏'; } }); updateCounts(); toast(isSaved(key) ? '已收藏，保存在当前浏览器' : '已取消收藏'); if (currentRoute().page === 'saved') collectionResults(true); return; }
    const kind = event.target.closest('[data-kind]');
    if (kind) { state.kind = kind.dataset.kind; state.query = ''; state.limit = 12; state.fragments = false; collection(currentRoute().page === 'saved'); return; }
    const pt = event.target.closest('[data-paragraph-translation]');
    if (pt) { const i = Number(pt.dataset.paragraphTranslation); if (state.readerTranslation) { state.readerTranslation = false; state.paragraphTranslation = new Set(data.articles.find(a => a.slug === currentRoute().id).paragraphs.map((_, i) => i)); } if (state.paragraphTranslation.has(i)) state.paragraphTranslation.delete(i); else state.paragraphTranslation.add(i); article(currentRoute().id, true); return; }
    const ps = event.target.closest('[data-paragraph-structure]');
    if (ps) { const i = Number(ps.dataset.paragraphStructure); if (state.readerStructure) { state.readerStructure = false; state.paragraphStructure = new Set(data.articles.find(a => a.slug === currentRoute().id).paragraphs.map((_, i) => i)); } if (state.paragraphStructure.has(i)) state.paragraphStructure.delete(i); else state.paragraphStructure.add(i); article(currentRoute().id, true); return; }
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'more') { state.limit += 12; collectionResults(); }
    if (action === 'priority') { state.priority = !state.priority; state.limit = 12; collection(currentRoute().page === 'saved'); }
    if (action === 'fragments') { state.fragments = !state.fragments; state.limit = 12; collectionResults(); }
    if (action === 'color') { state.color = !state.color; collectionResults(); }
    if (action === 'reader-structure') { state.readerStructure = !state.readerStructure; state.paragraphStructure.clear(); article(currentRoute().id, true); }
    if (action === 'reader-translation') { state.readerTranslation = !state.readerTranslation; state.paragraphTranslation.clear(); article(currentRoute().id, true); }
  });
  $('#main').addEventListener('input', event => { if (event.target.id === 'collection-search') { state.query = event.target.value; state.limit = 12; collectionResults(); } });
  document.querySelector('.skip-link').addEventListener('click', event => { event.preventDefault(); document.querySelector('#main').focus(); document.querySelector('#main').scrollIntoView({block:'start'}); });
  window.addEventListener('hashchange', () => { state.limit = 12; state.query = ''; state.paragraphTranslation.clear(); state.paragraphStructure.clear(); route(); window.scrollTo(0, 0); });
  $('#settings-button').addEventListener('click', () => { applySettings(); $('#settings-dialog').showModal(); });
  $('#close-settings').addEventListener('click', () => $('#settings-dialog').close());
  $('#settings-dialog').addEventListener('click', event => { if (event.target === $('#settings-dialog')) { const r = event.target.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) event.target.close(); } });
  $('#font-size').addEventListener('input', event => { state.font = Number(event.target.value); writeStore('font', state.font); applySettings(); });
  document.querySelectorAll('[data-theme-choice]').forEach(button => button.addEventListener('click', () => { state.theme = button.dataset.themeChoice; writeStore('theme', state.theme); applySettings(); }));
  $('#refresh-button').addEventListener('click', async () => { const button = $('#refresh-button'); button.disabled = true; try { const response = await fetch('./data.json?check=' + Date.now(), {cache:'no-store'}); if (!response.ok) throw Error('network'); const next = await response.json(); if (!Array.isArray(next.sentences) || !Array.isArray(next.articles) || !Array.isArray(next.lexicon)) throw Error('schema'); const changed = data.version !== next.version; data = next; route(); toast(changed ? '已载入最新内容' : '当前已是最新内容'); } catch { toast(location.protocol === 'file:' ? '本地副本已打开；在线网址可检查新内容' : '暂时未能检查更新，当前内容仍可阅读'); } finally { button.disabled = false; } });
  if (!data || !Array.isArray(data.sentences)) { setContent('<div class="empty-state"><h1>学习内容暂未载入</h1><p>请刷新页面，或重新打开阅读网址。</p></div>'); return; }
  applySettings(); route();
  if (location.protocol !== 'file:') fetch('./data.json?open=' + Date.now(), {cache:'no-store'}).then(r => r.ok ? r.json() : null).then(next => { if(next && next.version !== data.version && Array.isArray(next.sentences) && Array.isArray(next.lexicon) && Array.isArray(next.articles)){ data = next; route(); toast('已载入最新内容'); } }).catch(() => {});
})();
