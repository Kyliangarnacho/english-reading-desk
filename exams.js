'use strict';
(() => {
  const $ = (s, root = document) => root.querySelector(s);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const keyFor = id => 'english-desk-exam-' + id;
  const cache = new Map();
  const storageIssues = new Set();
  let activeId = '', mobilePane = 'article', fullTranslation = false, toastTimer;
  const exams = () => window.EXAM_DESK_DATA?.exams || [];
  const questions = exam => exam.sections.flatMap(s => s.questions);
  const fresh = exam => ({schemaVersion:1, examId:exam.id, answers:{}, flags:[], sectionIndex:0, questionPage:0, submitted:false, updatedAt:null});
  function notify(message) {
    const el = $('#toast'); if (!el) return;
    el.textContent = message; el.classList.add('visible'); clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('visible'), 3200);
  }
  function sanitize(raw, exam) {
    if (!raw || raw.examId !== exam.id || raw.schemaVersion !== 1 || !raw.answers || typeof raw.answers !== 'object' || Array.isArray(raw.answers)) throw Error('这份进度不属于当前试卷，或文件格式不正确。');
    const clean = fresh(exam), all = questions(exam);
    for (const q of all) {
      const value = raw.answers[q.number];
      if (typeof value !== 'string') continue;
      if (q.type === 'text') clean.answers[q.number] = value.slice(0, 50000);
      else if ((q.options || exam.sections.find(s => s.questions.includes(q))?.options || []).some(o => o.key === value)) clean.answers[q.number] = value;
    }
    clean.flags = Array.isArray(raw.flags) ? [...new Set(raw.flags.map(Number))].filter(n => all.some(q => q.number === n)) : [];
    clean.sectionIndex = Math.max(0, Math.min(exam.sections.length - 1, Number.isInteger(raw.sectionIndex) ? raw.sectionIndex : 0));
    const pageCount = Math.ceil(exam.sections[clean.sectionIndex].questions.length / 5);
    clean.questionPage = Math.max(0, Math.min(pageCount - 1, Number.isInteger(raw.questionPage) ? raw.questionPage : 0));
    clean.submitted = raw.submitted === true;
    clean.updatedAt = typeof raw.updatedAt === 'string' ? raw.updatedAt : null;
    return clean;
  }
  function progress(exam) {
    if (!cache.has(exam.id)) {
      let p = fresh(exam);
      try { const raw = JSON.parse(localStorage.getItem(keyFor(exam.id))); if (raw) p = sanitize(raw, exam); } catch { /* New or unavailable storage uses an in-memory attempt. */ }
      cache.set(exam.id, p);
    }
    return cache.get(exam.id);
  }
  function save(exam) {
    const p = progress(exam); p.updatedAt = new Date().toISOString();
    let ok = true;
    try { localStorage.setItem(keyFor(exam.id), JSON.stringify(p)); storageIssues.delete(exam.id); } catch { ok = false; storageIssues.add(exam.id); notify('浏览器暂时不能保存。请用“导出进度”备份本次作答。'); }
    const el = $('#exam-save-status');
    if (el) el.textContent = ok ? '已保存在此浏览器' : '暂未保存，请导出进度';
    return ok;
  }
  const answered = (p, q) => Boolean(p.answers[q.number]?.trim());
  function stats(exam, p) {
    const all = questions(exam), choices = all.filter(q => q.type !== 'text');
    return {done:all.filter(q => answered(p,q)).length,total:all.length,choiceTotal:choices.length,correct:choices.filter(q => p.answers[q.number] === q.answer).length,score:choices.reduce((n,q) => n + (p.answers[q.number] === q.answer ? Number(q.points || 0) : 0),0),possible:choices.reduce((n,q) => n + Number(q.points || 0),0)};
  }
  function listing() {
    activeId = ''; document.body.classList.remove('exam-active'); $('#main').classList.remove('exam-main');
    $('#main').innerHTML = `<div class="page-heading"><div class="eyebrow">YOUR EXAM DESK</div><h1>试卷练习</h1><p>一篇一页，专心做题。翻译和词义，需要时再看。</p></div><div class="exam-library">${exams().map(exam => {
      const p = progress(exam), s = stats(exam,p);
      return `<article class="exam-library-card"><div class="exam-card-label"><span>${esc(exam.kind || '英语试卷')}</span><span>${exam.durationMinutes || 180} 分钟 · ${exam.totalScore || 100} 分</span></div><h2>${esc(exam.title)}</h2><p>${exam.sections.length} 个部分 · ${s.total} 题<span class="exam-card-dot">·</span>文章、译文与解析已就位</p><div class="exam-card-progress"><span style="width:${s.done/s.total*100}%"></span></div><div class="exam-card-bottom"><span>${p.submitted ? '已交卷 · 可回看解析' : s.done ? '已作答 ' + s.done + ' / ' + s.total + ' 题' : '尚未开始'}<small>进度保存在当前浏览器</small></span><a class="btn-main" href="#exam/${esc(exam.id)}">${s.done || p.submitted ? '继续练习' : '开始做题'} <span aria-hidden="true">→</span></a></div></article>`;
    }).join('') || '<div class="empty-state">还没有安装试卷。</div>'}</div><p class="exam-library-note">以后上传试卷和答案，在聊天中主动调用 <b>$english-exam-install</b>，就可以把新试卷加入这里。</p>`;
  }
  function bodyText(text, p) {
    return esc(text).replace(/\[\[(\d+)\]\]/g, (_,n) => `<button type="button" class="exam-blank ${p.answers[n] ? 'has-answer' : ''}" data-exam-action="jump" data-number="${n}" aria-label="跳到第${n}题">${n}${p.answers[n] ? ' · ' + esc(p.answers[n]) : ''}</button>`);
  }
  function disclosure(id, title, content, cls = '') {
    return `<details class="exam-disclosure ${cls}" data-exam-disclosure="${esc(id)}"><summary>${esc(title)}</summary><div>${content}</div></details>`;
  }
  function articleHTML(section,p) {
    const image = typeof section.image === 'string' && /^(\.\/)?[\w\u3400-\u9fff/-]+\.(png|jpe?g|webp|svg)$/i.test(section.image) ? `<figure class="exam-prompt-image"><img src="${esc(section.image)}" alt="${esc(section.imageAlt || '试卷题目配图')}"></figure>` : '';
    return `<div class="exam-panel-heading"><div><span class="exam-panel-kicker">PASSAGE</span><h2>${esc(section.title)}</h2></div><div class="exam-panel-tools">${section.notes?.length ? '<button type="button" class="exam-tool" data-exam-action="notes">长难句</button>' : ''}<button type="button" class="exam-tool ${fullTranslation ? 'active' : ''}" data-exam-action="translation" aria-pressed="${fullTranslation}">${fullTranslation ? '收起全文翻译' : '全文翻译'}</button></div></div><div class="exam-article-scroll" tabindex="0" aria-label="${esc(section.title)}原文"><div class="exam-article-inner">${matchingSequence(section,p)}${section.directions ? (section.type === 'writing' ? `<p class="exam-directions" lang="en">${esc(section.directions)}</p>` : disclosure('directions','题目说明',`<p class="exam-directions" lang="en">${esc(section.directions)}</p>`,'exam-direction-disclosure')) : ''}${image}${(section.paragraphs || []).map((para,i) => `<section class="exam-paragraph"><span class="exam-paragraph-number">${String(i+1).padStart(2,'0')}</span><p class="exam-english" lang="en">${bodyText(para.en,p)}</p>${para.zh ? (fullTranslation ? `<p class="exam-paragraph-translation">${esc(para.zh)}</p>` : disclosure('paragraph-'+i,'本段翻译',`<p class="exam-paragraph-translation">${esc(para.zh)}</p>`,'exam-paragraph-disclosure')) : ''}</section>`).join('')}${(section.notes || []).length ? disclosure('long-sentences','长难句 · ' + section.notes.length + ' 处',(section.notes || []).map((note,i) => `<section class="exam-sentence"><span class="exam-panel-kicker">${String(i+1).padStart(2,'0')}</span><p class="exam-english" lang="en">${esc(note.text)}</p><p class="exam-paragraph-translation">${esc(note.translation)}</p>${note.hint ? `<p class="exam-sentence-hint">${esc(note.hint)}</p>` : ''}</section>`).join(''),'exam-sentences') : ''}<div class="exam-end">END OF PASSAGE</div></div></div>`;
  }
  function matchingSequence(section,p) {
    if (section.type !== 'matching' || !Array.isArray(section.sequence)) return '';
    const fixed = section.sequence.filter(slot => typeof slot === 'string');
    return `<div class="exam-matching-sequence"><span>原卷排列顺序 · ${fixed.map(esc).join(' / ')} 已给定</span><div>${section.sequence.map(slot => typeof slot === 'number' ? `<button type="button" data-exam-action="jump" data-number="${slot}" aria-label="选择第${slot}空">${slot}${p.answers[slot] ? ' · ' + esc(p.answers[slot]) : ''}</button>` : `<b>${esc(slot)}</b>`).join('<i aria-hidden="true">→</i>')}</div></div>`;
  }
  function optionHTML(o,q,p,section) {
    const matching = section.type === 'matching', value = p.answers[q.number] || '';
    if (matching && (section.sequence || []).filter(slot => typeof slot === 'string').includes(o.key)) return '';
    const text = matching ? o.text.split(/\s+/).slice(0,10).join(' ') + (o.text.split(/\s+/).length > 10 ? '…' : '') : o.text;
    return `<div class="exam-option-wrap"><label class="exam-option ${matching ? 'exam-matching-option' : ''} ${value === o.key ? 'selected' : ''} ${p.submitted && o.key === q.answer ? 'correct-option' : ''}"><input type="radio" name="exam-q-${q.number}" value="${esc(o.key)}" data-exam-answer="${q.number}" ${value === o.key ? 'checked' : ''}><span class="exam-option-key">${esc(o.key)}</span><span class="exam-option-text" lang="en">${esc(text)}</span>${p.submitted && o.key === q.answer ? '<span class="exam-option-check" aria-label="正确答案">✓</span>' : ''}</label>${o.meaning ? disclosure('gloss-'+q.number+'-'+o.key,matching ? '本段译文' : '词义',`<p>${esc(o.meaning)}</p>`,'exam-option-gloss') : ''}</div>`;
  }
  function questionHTML(q,p,section) {
    const value = p.answers[q.number] || '', flag = p.flags.includes(q.number), correct = value === q.answer;
    const options = q.options || section.options || [];
    const isText = q.type === 'text';
    return `<article class="exam-question ${p.submitted && !isText ? (correct ? 'is-correct' : 'is-incorrect') : ''}" id="exam-question-${q.number}"><div class="exam-question-top"><span class="exam-question-number">${String(q.number).padStart(2,'0')}<small>${q.points || ''}${q.points ? ' 分' : ''}</small></span><button type="button" class="exam-mark ${flag ? 'active' : ''}" data-exam-action="flag" data-number="${q.number}" aria-pressed="${flag}" aria-label="${flag ? '取消标记' : '标记'}第${q.number}题">${flag ? '◆ 已标记' : '◇ 标记'}</button></div><fieldset ${p.submitted ? 'disabled' : ''}><legend class="exam-question-stem" lang="en">${esc(q.stem || 'Choose the best answer for blank ' + q.number + '.')}</legend>${isText ? `<label class="visually-hidden" for="exam-answer-${q.number}">第${q.number}题作答</label><textarea id="exam-answer-${q.number}" class="exam-text-answer" data-exam-answer="${q.number}" placeholder="${section.type === 'translation' ? '在这里写下你的翻译…' : '在这里写下你的答案…'}" rows="${section.type === 'writing' ? 12 : 5}" spellcheck="false">${esc(value)}</textarea><div class="exam-word-count" data-word-count="${q.number}">${section.type === 'writing' ? wordCount(value) + ' words' : value.length + ' 字符'}</div>` : `<div class="exam-options">${options.map(o => optionHTML(o,q,p,section)).join('')}</div>`}</fieldset>${q.stemZh ? disclosure('stem-'+q.number,'题干翻译',`<p>${esc(q.stemZh)}</p>`,'exam-stem-gloss') : ''}${p.submitted ? `<div class="exam-answer-review"><strong>${isText ? '参考答案 · 主观题请自行对照' : (correct ? '回答正确' : value ? '本题答错' : '本题未作答') + ' · 参考答案 ' + esc(q.answer)}</strong>${isText ? `<p class="${section.type === 'writing' ? 'exam-sample-writing' : ''}">${esc(q.answer || '请对照原始解析核对。')}</p>` : ''}${q.explanation ? `<p>${esc(q.explanation)}</p>` : ''}</div>` : ''}</article>`;
  }
  const wordCount = text => (text.trim().match(/\b[\w]+(?:['’-][\w]+)*\b/g) || []).length;
  function questionPanelHTML(exam,section,p) {
    const pages = Math.ceil(section.questions.length/5), list = section.questions.slice(p.questionPage*5,p.questionPage*5+5);
    return `<div class="exam-panel-heading"><div><span class="exam-panel-kicker">QUESTIONS</span><h2>${section.questions[0]?.number}–${section.questions.at(-1)?.number} 题</h2></div><span class="exam-panel-caption">${section.questions.filter(q => answered(p,q)).length} / ${section.questions.length} 已答</span></div><div class="exam-questions-scroll" tabindex="0" aria-label="本页题目">${list.map(q => questionHTML(q,p,section)).join('')}</div><div class="exam-question-pagination"><button type="button" class="exam-tool" data-exam-action="question-prev" ${p.questionPage === 0 ? 'disabled' : ''}>← 上页题目</button><span>${p.questionPage+1} / ${pages}</span><button type="button" class="exam-tool" data-exam-action="question-next" ${p.questionPage >= pages-1 ? 'disabled' : ''}>下页题目 →</button></div>`;
  }
  function captureView() {
    return {article:$('.exam-article-scroll')?.scrollTop || 0, questions:$('.exam-questions-scroll')?.scrollTop || 0, page:window.scrollY, open:[...document.querySelectorAll('[data-exam-disclosure][open]')].map(el => el.dataset.examDisclosure)};
  }
  function restoreView(view) {
    for (const el of document.querySelectorAll('[data-exam-disclosure]')) el.open = view.open.includes(el.dataset.examDisclosure);
    const a = $('.exam-article-scroll'), q = $('.exam-questions-scroll'); if (a) a.scrollTop = view.article; if (q) q.scrollTop = view.questions;
    window.scrollTo(0,view.page);
  }
  function paper(exam,keep = false) {
    const old = keep ? captureView() : null;
    activeId = exam.id; const p = progress(exam), section = exam.sections[p.sectionIndex], s = stats(exam,p);
    p.questionPage = Math.max(0,Math.min(p.questionPage, Math.max(0,Math.ceil(section.questions.length/5)-1)));
    document.body.classList.add('exam-active'); $('#main').classList.add('exam-main');
    $('#main').innerHTML = `<div class="exam-page"><div class="exam-heading"><div><a class="exam-back" href="#exams">← 试卷目录</a><h1>${esc(exam.title)}<span class="exam-kind">${esc(exam.kind || '英语')}</span></h1></div><div class="exam-heading-actions"><span id="exam-save-status" role="status">${storageIssues.has(exam.id) ? '暂未保存，请导出进度' : '自动保存到此浏览器'}</span><button type="button" class="${p.submitted ? 'exam-tool' : 'btn-main'}" data-exam-action="${p.submitted ? 'resume' : 'submit'}">${p.submitted ? '继续修改' : '交卷批改'}</button><button type="button" class="exam-tool exam-more-button" data-exam-action="tools" aria-label="进度备份与更多操作">•••</button></div></div><div class="exam-progress-line"><span id="exam-progress-label">已作答 ${s.done} / ${s.total} 题</span><div role="progressbar" aria-label="作答进度" aria-valuemin="0" aria-valuemax="${s.total}" aria-valuenow="${s.done}"><span style="width:${s.done/s.total*100}%"></span></div><span>${p.submitted ? '解析已开放' : '翻译、词义按需查看'}</span></div>${p.submitted ? `<div class="exam-result" role="status"><strong>客观题 ${s.score} / ${s.possible} 分</strong><span>答对 ${s.correct} / ${s.choiceTotal} 题 · 翻译和作文请对照参考答案自评</span></div>` : ''}<nav class="exam-sections" aria-label="试卷部分">${exam.sections.map((sec,i) => `<button type="button" data-exam-action="section" data-index="${i}" class="${i === p.sectionIndex ? 'active' : ''}" ${i === p.sectionIndex ? 'aria-current="step"' : ''}><span>${esc(sec.title)}</span><small>${esc(sec.subtitle || sec.questions[0]?.number + '–' + sec.questions.at(-1)?.number + '题')}</small></button>`).join('')}</nav><div class="exam-current-line"><span>${String(p.sectionIndex+1).padStart(2,'0')} / ${String(exam.sections.length).padStart(2,'0')}<b>${esc(section.subtitle || section.title)}</b></span><div><button type="button" class="exam-inline" data-exam-action="section-prev" ${p.sectionIndex === 0 ? 'disabled' : ''}>← 上一部分</button><button type="button" class="exam-inline" data-exam-action="section-next" ${p.sectionIndex === exam.sections.length-1 ? 'disabled' : ''}>下一部分 →</button></div></div><div class="exam-mobile-tabs" role="group" aria-label="原文与题目切换"><button type="button" data-exam-action="pane" data-pane="article" aria-pressed="${mobilePane === 'article'}" class="${mobilePane === 'article' ? 'active' : ''}">文章原文</button><button type="button" data-exam-action="pane" data-pane="questions" aria-pressed="${mobilePane === 'questions'}" class="${mobilePane === 'questions' ? 'active' : ''}">题目与作答</button></div><div class="exam-workspace" data-pane="${mobilePane}"><section class="exam-article-panel" aria-label="原文阅读">${articleHTML(section,p)}</section><section class="exam-questions-panel" aria-label="题目与作答">${questionPanelHTML(exam,section,p)}</section></div><details class="exam-answer-sheet" data-exam-disclosure="answer-sheet"><summary>答题卡 <span>按题号跳转 · ◆ 已标记</span></summary><div class="exam-answer-grid">${questions(exam).map(q => `<button type="button" data-exam-action="jump" data-number="${q.number}" class="${answered(p,q) ? 'answered' : ''} ${p.flags.includes(q.number) ? 'flagged' : ''} ${p.submitted && q.type !== 'text' ? (p.answers[q.number] === q.answer ? 'correct' : 'incorrect') : ''}" aria-label="第${q.number}题${answered(p,q) ? '已作答' : '未作答'}${p.flags.includes(q.number) ? '，已标记' : ''}">${q.number}${p.flags.includes(q.number) ? '<sup>◆</sup>' : ''}</button>`).join('')}</div></details><p class="exam-bottom-note">进度仅保存在当前浏览器。换设备前，可在右上角“•••”导出进度，再在另一台设备导入。</p></div>`;
    if (old) restoreView(old);
    const activeTab = $('.exam-sections .active'); if (!keep && activeTab) activeTab.scrollIntoView({block:'nearest',inline:'nearest'});
  }
  function render(id) {
    if (!id) { listing(); return; }
    const exam = exams().find(e => e.id === id);
    if (!exam) { listing(); notify('这份试卷暂未安装，请从目录选择。'); return; }
    fullTranslation = false; mobilePane = 'article'; paper(exam);
  }
  function jump(exam,n) {
    const p = progress(exam), i = exam.sections.findIndex(sec => sec.questions.some(q => q.number === n)); if (i < 0) return;
    const sameSection = i === p.sectionIndex;
    if (!sameSection) fullTranslation = false;
    p.sectionIndex = i; p.questionPage = Math.floor(exam.sections[i].questions.findIndex(q => q.number === n)/5); mobilePane = 'questions'; save(exam); paper(exam,sameSection);
    const target = $('#exam-question-'+n); target?.scrollIntoView({block:'start',behavior:'smooth'}); const focus = target?.querySelector('input, textarea'); focus?.focus({preventScroll:true});
  }
  function modal(title,html,buttons) {
    $('#exam-dialog')?.remove();
    const dialog = document.createElement('dialog'); dialog.id = 'exam-dialog'; dialog.className = 'exam-dialog'; dialog.setAttribute('aria-labelledby','exam-dialog-title');
    dialog.innerHTML = `<div class="dialog-heading"><h2 id="exam-dialog-title">${esc(title)}</h2><button type="button" class="exam-dialog-close" data-exam-action="close-modal" aria-label="关闭">×</button></div>${html}<div class="exam-dialog-actions">${buttons}</div>`;
    document.body.append(dialog); dialog.addEventListener('cancel',() => { pendingImport = null; }); dialog.addEventListener('close',() => dialog.remove()); dialog.showModal();
    return dialog;
  }
  const closeModal = () => { pendingImport = null; const dialog = $('#exam-dialog'); if (dialog) { dialog.close(); dialog.remove(); } };
  const button = (action,text,primary = false) => `<button type="button" class="${primary ? 'btn-main' : 'exam-tool'}" data-exam-action="${action}">${esc(text)}</button>`;
  function exportProgress(exam) {
    const blob = new Blob([JSON.stringify(progress(exam),null,2)],{type:'application/json'}), url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = exam.id + '-progress.json'; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url),1000); notify('进度已导出，请保存下载的 JSON 文件。');
  }
  document.addEventListener('click', event => {
    const control = event.target.closest('[data-exam-action]'); if (!control) return;
    const action = control.dataset.examAction, exam = exams().find(e => e.id === activeId); if (!exam) return;
    const p = progress(exam);
    if (action === 'close-modal') { closeModal(); return; }
    if (action === 'flag') { const n = Number(control.dataset.number); p.flags = p.flags.includes(n) ? p.flags.filter(x => x !== n) : [...p.flags,n]; save(exam); paper(exam,true); $('#exam-question-'+n+' [data-exam-action="flag"]')?.focus({preventScroll:true}); }
    if (action === 'pane') { mobilePane = control.dataset.pane; paper(exam,true); }
    if (action === 'translation') { fullTranslation = !fullTranslation; paper(exam,true); $('.exam-article-panel [data-exam-action="translation"]')?.focus({preventScroll:true}); }
    if (action === 'notes') {
      const section = exam.sections[p.sectionIndex];
      modal('长难句 · ' + section.title,(section.notes || []).map((note,i) => `<section class="exam-sentence"><span class="exam-panel-kicker">${String(i+1).padStart(2,'0')}</span><p class="exam-english" lang="en">${esc(note.text)}</p><p class="exam-paragraph-translation">${esc(note.translation)}</p>${note.hint ? `<p class="exam-sentence-hint">${esc(note.hint)}</p>` : ''}</section>`).join(''),button('close-modal','返回原文',true)).classList.add('exam-notes-dialog');
    }
    if (action === 'jump') jump(exam,Number(control.dataset.number));
    if (['section','section-prev','section-next'].includes(action)) {
      const next = action === 'section' ? Number(control.dataset.index) : p.sectionIndex + (action === 'section-prev' ? -1 : 1);
      if (next < 0 || next >= exam.sections.length || next === p.sectionIndex) return;
      p.sectionIndex = next; p.questionPage = 0; fullTranslation = false; mobilePane = 'article'; save(exam); paper(exam);
    }
    if (action === 'question-prev' || action === 'question-next') {
      p.questionPage += action === 'question-prev' ? -1 : 1; save(exam); const old = captureView(); old.questions = 0; old.open = old.open.filter(id => !id.startsWith('gloss-') && !id.startsWith('stem-')); paper(exam,true); restoreView(old); $('.exam-questions-scroll')?.focus({preventScroll:true});
    }
    if (action === 'submit') {
      const s = stats(exam,p); modal('交卷并查看解析',`<p>已作答 <strong>${s.done} / ${s.total}</strong> 题${s.done < s.total ? '，还有 ' + (s.total-s.done) + ' 题未答' : ''}。</p><p>交卷后显示客观题成绩、正确答案和解析。翻译、作文提供参考答案，供你自行对照。</p>`,button('close-modal','继续做题') + button('confirm-submit','交卷批改',true));
    }
    if (action === 'confirm-submit') { p.submitted = true; save(exam); closeModal(); paper(exam,true); notify('已交卷，可以查看答案与解析。'); }
    if (action === 'resume') { p.submitted = false; save(exam); paper(exam,true); notify('已回到作答模式，修改后可再次交卷。'); }
    if (action === 'tools') modal('进度与备份',`<p>作答、标记和当前页会自动保存在此浏览器。导出的文件可以带到其他设备继续。</p><div class="exam-backup-buttons">${button('export','导出进度')}<label class="exam-tool exam-import-label">导入进度<input type="file" id="exam-import-file" accept="application/json,.json"></label></div><p class="exam-source-note">试卷：${esc(exam.source?.paper || '')}<br>答案参考：${esc(exam.source?.analysis || '')}${exam.source?.note ? '<br>' + esc(exam.source.note) : ''}</p>`,button('reset','重新做这份试卷') + button('close-modal','完成',true));
    if (action === 'export') exportProgress(exam);
    if (action === 'reset') modal('重新做这份试卷', '<p>本份试卷的答案、标记和交卷结果将被清空。建议先导出进度备份。</p>',button('export','先导出进度') + button('close-modal','取消') + button('confirm-reset','清空并重做',true));
    if (action === 'confirm-reset') { cache.set(exam.id,fresh(exam)); save(exam); closeModal(); fullTranslation = false; mobilePane = 'article'; paper(exam); notify('已开始新一次练习。'); }
    if (action === 'confirm-import') { if (pendingImport) { cache.set(exam.id,pendingImport); pendingImport = null; save(exam); closeModal(); fullTranslation = false; paper(exam); notify('进度已导入。'); } }
  });
  let pendingImport = null;
  document.addEventListener('change', async event => {
    const exam = exams().find(e => e.id === activeId); if (!exam) return;
    if (event.target.matches('input[data-exam-answer]')) {
      const p = progress(exam); if (p.submitted) return;
      const number = Number(event.target.dataset.examAnswer), q = questions(exam).find(q => q.number === number);
      const options = q?.options || exam.sections.find(s => s.questions.includes(q))?.options || [];
      if (!options.some(o => o.key === event.target.value)) return;
      p.answers[number] = event.target.value; save(exam); paper(exam,true);
      $(`input[data-exam-answer="${number}"][value="${event.target.value}"]`)?.focus({preventScroll:true});
    }
    if (event.target.id === 'exam-import-file') {
      const file = event.target.files[0]; if (!file) return;
      if (file.size > 3000000) { notify('文件过大，请选择导出的进度 JSON 文件。'); return; }
      try {
        const clean = sanitize(JSON.parse(await file.text()),exam); pendingImport = clean;
        modal('导入这份进度',`<p>文件中已作答 <strong>${stats(exam,clean).done} / ${questions(exam).length}</strong> 题。导入后将替换此浏览器中本份试卷的当前进度。</p>`,button('close-modal','取消') + button('confirm-import','替换并继续',true));
      } catch (error) { notify(error instanceof SyntaxError ? '文件不是有效的进度 JSON，请重新选择。' : error.message); }
    }
  });
  document.addEventListener('input', event => {
    if (!event.target.matches('textarea[data-exam-answer]')) return;
    const exam = exams().find(e => e.id === activeId); if (!exam) return;
    const p = progress(exam); if (p.submitted) return;
    const n = Number(event.target.dataset.examAnswer); p.answers[n] = event.target.value; save(exam);
    const s = stats(exam,p); $('#exam-progress-label').textContent = '已作答 ' + s.done + ' / ' + s.total + ' 题';
    const bar = $('[role="progressbar"]'); bar?.setAttribute('aria-valuenow',s.done); if (bar?.firstElementChild) bar.firstElementChild.style.width = s.done/s.total*100 + '%';
    const section = exam.sections[p.sectionIndex], count = $(`[data-word-count="${n}"]`); if (count) count.textContent = section.type === 'writing' ? wordCount(event.target.value) + ' words' : event.target.value.length + ' 字符';
    const sheetButton = $(`.exam-answer-grid [data-number="${n}"]`); sheetButton?.classList.toggle('answered', Boolean(event.target.value.trim()));
    sheetButton?.setAttribute('aria-label',`第${n}题${event.target.value.trim() ? '已作答' : '未作答'}${p.flags.includes(n) ? '，已标记' : ''}`);
    const caption = $('.exam-panel-caption'); if (caption) caption.textContent = section.questions.filter(q => answered(p,q)).length + ' / ' + section.questions.length + ' 已答';
  });
  window.addEventListener('hashchange', () => { if (!/^#exams?(\/|$)/.test(location.hash)) { activeId = ''; document.body.classList.remove('exam-active'); $('#main')?.classList.remove('exam-main'); closeModal(); } });
  async function refresh() {
    if (location.protocol === 'file:') return false;
    const response = await fetch('./exams.json?check='+Date.now(),{cache:'no-store'}); if (!response.ok) throw Error('exam content');
    const next = await response.json();
    if (next.schemaVersion !== 1 || !Array.isArray(next.exams) || !next.exams.every(e => typeof e.id === 'string' && Array.isArray(e.sections) && e.sections.length && e.sections.every(s => Array.isArray(s.questions) && s.questions.length))) throw Error('exam schema');
    const changed = next.version !== window.EXAM_DESK_DATA?.version;
    if (changed) {
      window.EXAM_DESK_DATA = next;
      for (const exam of next.exams) if (cache.has(exam.id)) { try { cache.set(exam.id,sanitize(cache.get(exam.id),exam)); } catch { cache.set(exam.id,fresh(exam)); } }
    }
    return changed;
  }
  window.EnglishExamDesk = {render,refresh};
})();
