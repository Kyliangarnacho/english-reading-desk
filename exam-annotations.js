'use strict';
(() => {
  const $ = (s, root = document) => root.querySelector(s);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const storageKey = id => 'english-desk-annotations-' + id;
  const kinds = ['词语','难句','错因'];
  const cache = new Map(), storageProblems = new Set(), unreadableStores = new Set();
  let context = null, candidate = null, editor = null, listScope = 'section', selectionTimer, toastTimer;
  const uid = () => typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,12);
  const byExam = id => window.EXAM_DESK_DATA?.exams?.find(e => e.id === id);
  const bySection = (exam,id) => exam?.sections?.find(s => s.id === id);
  const sectionQuestions = section => section?.questions || [];
  const sourceParagraph = (exam,record) => bySection(exam,record.sectionId)?.paragraphs?.[record.paragraphIndex];
  const visibleRecord = record => record.highlighted !== false;
  function notify(message) {
    const node = $('#toast'); if (!node) return;
    node.textContent = message; node.classList.add('visible'); clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove('visible'),3500);
  }
  function validShape(raw,exam) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.examId !== exam.id || typeof raw.id !== 'string' || !/^[\w-]{1,100}$/.test(raw.id)) throw Error('标注身份格式不正确。');
    const section = bySection(exam,raw.sectionId);
    if (!section || !kinds.includes(raw.kind) || typeof raw.note !== 'string' || raw.note.length > 20000 || typeof raw.quote !== 'string' || raw.quote.length > 100000) throw Error('标注内容或所属篇目不正确。');
    const qn = raw.questionNumber == null ? null : raw.questionNumber;
    if (qn !== null && (!Number.isInteger(qn) || !sectionQuestions(section).some(q => q.number === qn))) throw Error('标注关联的题号不正确。');
    const anchored = raw.paragraphIndex !== null;
    if (anchored && (!Number.isInteger(raw.paragraphIndex) || raw.paragraphIndex < 0 || !section.paragraphs[raw.paragraphIndex] || !Number.isInteger(raw.start) || !Number.isInteger(raw.end) || raw.start < 0 || raw.end <= raw.start || raw.end - raw.start !== raw.quote.length)) throw Error('标注的原文位置不正确。');
    if (!anchored && (qn === null || raw.start !== null || raw.end !== null || raw.quote !== '')) throw Error('题目笔记格式不正确。');
    return {id:raw.id,examId:exam.id,sectionId:section.id,paragraphIndex:anchored ? raw.paragraphIndex : null,start:anchored ? raw.start : null,end:anchored ? raw.end : null,quote:raw.quote,note:raw.note,kind:raw.kind,questionNumber:qn,highlighted:raw.highlighted!==false,createdAt:typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),updatedAt:typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString()};
  }
  const anchoredCorrectly = (exam,record) => record.paragraphIndex === null || sourceParagraph(exam,record)?.en?.slice(record.start,record.end) === record.quote;
  function records(exam) {
    if (!exam) return [];
    if (!cache.has(exam.id)) {
      let saved = [];
      try {
        const raw = JSON.parse(localStorage.getItem(storageKey(exam.id)));
        if (raw) {
          if (raw.schemaVersion !== 1 || raw.examId !== exam.id || !Array.isArray(raw.annotations)) throw Error('format');
          saved = raw.annotations.map(item => validShape(item,exam));
        }
      } catch { unreadableStores.add(exam.id); storageProblems.add(exam.id); notify('已有标注暂时无法读取。原数据保留，请先导出本次新增笔记备份。'); }
      cache.set(exam.id,saved);
    }
    return cache.get(exam.id);
  }
  function persist(exam) {
    let saved = false;
    try {
      if (unreadableStores.has(exam.id)) throw Error('keep unreadable original');
      localStorage.setItem(storageKey(exam.id),JSON.stringify({schemaVersion:1,examId:exam.id,annotations:records(exam)}));
      storageProblems.delete(exam.id); saved = true;
    } catch { storageProblems.add(exam.id); notify('标注暂未写入浏览器，请通过“导出标注”备份本次笔记。'); }
    const total = count(exam.id), sectionId = context?.section.id;
    document.dispatchEvent(new CustomEvent('exam-annotations-change',{detail:{examId:exam.id,sectionId,count:count(exam.id,sectionId),total,saved}}));
    return saved;
  }
  function unwrap(paragraph) {
    paragraph.querySelectorAll('mark[data-exam-annotation]').forEach(mark => mark.replaceWith(...mark.childNodes));
    paragraph.normalize();
  }
  function paint() {
    if (!context) return;
    const {exam,section,root} = context;
    for (const paragraph of root.querySelectorAll('.exam-english[data-paragraph-index]')) {
      const index = Number(paragraph.dataset.paragraphIndex), source = section.paragraphs[index];
      if (!source) continue;
      unwrap(paragraph);
      const marks = records(exam).filter(r => r.highlighted!==false && r.sectionId === section.id && r.paragraphIndex === index && anchoredCorrectly(exam,r));
      if (!marks.length) continue;
      let offset = 0;
      const walk = node => {
        if (node.nodeType === Node.TEXT_NODE) {
          const text = node.data, start = offset; offset += text.length;
          const relevant = marks.filter(r => r.start < offset && r.end > start);
          if (!relevant.length) return;
          const cuts = [...new Set([0,text.length,...relevant.flatMap(r => [Math.max(0,r.start-start),Math.min(text.length,r.end-start)])])].sort((a,b) => a-b);
          const fragment = document.createDocumentFragment();
          for (let i=0;i<cuts.length-1;i++) {
            const left = cuts[i], right = cuts[i+1], active = relevant.filter(r => r.start < start+right && r.end > start+left);
            if (!active.length) fragment.append(document.createTextNode(text.slice(left,right)));
            else {
              const mark = document.createElement('mark');
              mark.dataset.examAnnotation = active.map(r => r.id).join(',');
              mark.className = 'exam-annotation-mark' + (active.some(r => r.kind === '错因') ? ' is-reason' : active.some(r => r.kind === '难句') ? ' is-sentence' : '');
              mark.title = active.map(r => r.note || r.kind).join('；'); mark.textContent = text.slice(left,right);
              fragment.append(mark);
            }
          }
          node.replaceWith(fragment); return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        if (node.classList.contains('exam-blank')) { offset += ('[['+node.dataset.number+']]').length; return; }
        [...node.childNodes].forEach(walk);
      };
      [...paragraph.childNodes].forEach(walk);
    }
  }
  function clearSelection() { window.getSelection()?.removeAllRanges(); hideToolbar(); }
  function hideToolbar() { const toolbar = $('#exam-selection-toolbar'); if (toolbar) toolbar.hidden = true; candidate = null; }
  function paragraphFor(node) { return (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement)?.closest('.exam-english[data-paragraph-index]'); }
  function sourceOffset(paragraph,node,offset) {
    const range = document.createRange(); range.selectNodeContents(paragraph); range.setEnd(node,offset);
    const prefix = range.cloneContents();
    prefix.querySelectorAll('.exam-blank').forEach(blank => blank.replaceWith(document.createTextNode('[['+blank.dataset.number+']]')));
    return prefix.textContent.length;
  }
  function currentSelection(warn = false) {
    if (!context || $('#exam-annotation-dialog')?.open) return null;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount !== 1) return null;
    const range = selection.getRangeAt(0), startP = paragraphFor(range.startContainer), endP = paragraphFor(range.endContainer);
    if (!startP || !context.root.contains(startP)) return null;
    if (!endP || startP !== endP) { if (warn) notify('请按段分别标注，这样能准确保留原文位置。'); return null; }
    if ((range.startContainer.parentElement?.closest('.exam-blank')) || (range.endContainer.parentElement?.closest('.exam-blank'))) return null;
    const paragraphIndex = Number(startP.dataset.paragraphIndex), paragraph = context.section.paragraphs[paragraphIndex];
    if (!paragraph) return null;
    let start = sourceOffset(startP,range.startContainer,range.startOffset), end = sourceOffset(startP,range.endContainer,range.endOffset);
    while (start < end && /\s/.test(paragraph.en[start])) start++;
    while (end > start && /\s/.test(paragraph.en[end-1])) end--;
    if (start === end || end-start > 100000) return null;
    return {examId:context.exam.id,sectionId:context.section.id,paragraphIndex,start,end,quote:paragraph.en.slice(start,end),rect:range.getBoundingClientRect()};
  }
  function selectedHighlights(selected) {
    if(!context || !selected)return [];
    return records(context.exam).filter(r=>r.highlighted!==false&&r.sectionId===selected.sectionId&&r.paragraphIndex===selected.paragraphIndex&&r.start<selected.end&&r.end>selected.start&&anchoredCorrectly(context.exam,r));
  }
  function updateToolbar(warn = false) {
    const selected = currentSelection(warn);
    if (!selected) { hideToolbar(); return; }
    candidate = selected;
    let toolbar = $('#exam-selection-toolbar');
    if (!toolbar) {
      toolbar = document.createElement('div'); toolbar.id = 'exam-selection-toolbar'; toolbar.className = 'exam-selection-toolbar'; toolbar.setAttribute('role','toolbar'); toolbar.setAttribute('aria-label','原文标注');
      toolbar.innerHTML = '<button type="button" data-annotation-action="highlight">高亮</button><button type="button" data-annotation-action="selection-note">笔记 / 就地对照</button><button type="button" class="annotation-toolbar-close" data-annotation-action="dismiss-selection" aria-label="关闭标注工具">×</button>';
      toolbar.addEventListener('mousedown',event => event.preventDefault()); document.body.append(toolbar);
    }
    const highlightButton=toolbar.querySelector('[data-annotation-action="highlight"]'),alreadyHighlighted=selectedHighlights(selected).length>0;
    highlightButton.textContent=alreadyHighlighted?'取消高亮':'高亮';highlightButton.setAttribute('aria-pressed',String(alreadyHighlighted));
    toolbar.hidden = false;
    const width = toolbar.getBoundingClientRect().width;
    toolbar.style.left = Math.max(10,Math.min(selected.rect.left,document.documentElement.clientWidth-width-10))+'px';
    toolbar.style.top = Math.max(8,selected.rect.top-48)+'px';
  }
  function freshRecord(selection,kind='词语',questionNumber=null) {
    const now = new Date().toISOString();
    return {id:uid(),examId:selection.examId,sectionId:selection.sectionId,paragraphIndex:selection.paragraphIndex,start:selection.start,end:selection.end,quote:selection.quote,note:'',kind,questionNumber,createdAt:now,updatedAt:now};
  }
  function insert(record) {
    const exam = byExam(record.examId); if (!exam) return false;
    const clean = validShape(record,exam);
    if (!anchoredCorrectly(exam,clean)) { notify('这段原文已经更新，请重新选择后标注。'); return false; }
    const all = records(exam), i = all.findIndex(r => r.id === clean.id);
    if (i < 0) all.push(clean); else all[i] = clean;
    const saved = persist(exam); paint(); return saved;
  }
  function closeDialog() {
    const dialog = $('#exam-annotation-dialog');
    if (dialog) { dialog.close(); dialog.remove(); }
    editor = null;
  }
  function dialog(title,html,buttons,cls='') {
    closeDialog();
    const node = document.createElement('dialog'); node.id = 'exam-annotation-dialog'; node.className = 'exam-annotation-dialog '+cls;
    node.setAttribute('aria-labelledby','annotation-dialog-title');
    node.innerHTML = `<div class="annotation-dialog-heading"><div><span class="annotation-eyebrow">READ · THINK · REMEMBER</span><h2 id="annotation-dialog-title">${esc(title)}</h2></div><button type="button" class="annotation-close" data-annotation-action="close" aria-label="关闭标注">×</button></div>${html}<div class="annotation-dialog-footer">${buttons}</div>`;
    node.addEventListener('cancel',() => { editor = null; });
    node.addEventListener('close',() => node.remove());
    document.body.append(node); node.showModal(); return node;
  }
  const actionButton = (action,label,primary=false) => `<button type="button" class="${primary ? 'annotation-button-primary' : 'annotation-button'}" data-annotation-action="${action}">${esc(label)}</button>`;
  function contextHTML(record,exam,expand=false) {
    const section = bySection(exam,record.sectionId), paragraph = sourceParagraph(exam,record);
    if (!paragraph) return '';
    const notes = (section.notes || []).filter(n => {
      const position = paragraph.en.indexOf(n.text);
      return position >= 0 && position < record.end && position+n.text.length > record.start;
    });
    return `<details class="annotation-context" ${expand ? 'open' : ''}><summary>就地对照：本段译文${notes.length ? '与句子结构' : ''}</summary><div><p class="annotation-context-label">以下是所在段的整体译文，帮助你判断语境。</p><p class="annotation-translation">${esc(paragraph.zh || '本段暂未提供译文。')}</p>${notes.map(n => `<div class="annotation-sentence-context"><p class="annotation-quote" lang="en">${esc(n.text)}</p><p>${esc(n.translation)}</p>${n.hint ? `<p class="annotation-hint">${esc(n.hint)}</p>` : ''}</div>`).join('')}</div></details>`;
  }
  function openEditor(record,{expandContext=false,returnToList=false}={}) {
    const exam = byExam(record.examId); if (!exam) return;
    const section = bySection(exam,record.sectionId), existing = records(exam).some(r => r.id === record.id), stale = !anchoredCorrectly(exam,record);
    const q = sectionQuestions(section).find(q => q.number === record.questionNumber);
    clearSelection();
    const node = dialog(existing ? '我的标注' : record.kind === '错因' ? '留下一条做题经验' : '把这处理解留下来',`<div class="annotation-record-location">${esc(exam.title)} · ${esc(section.title)}${record.paragraphIndex !== null ? ' · 第'+(record.paragraphIndex+1)+'段' : ' · 题目笔记'}</div>${record.quote ? `<blockquote class="annotation-quote annotation-selected-quote" lang="en">${esc(record.quote)}</blockquote>` : `<p class="annotation-question-context">第 ${record.questionNumber} 题${q ? ' · '+esc(q.stem) : ''}</p>`}${stale ? '<p class="annotation-warning">原文已经更新，当前位置暂不能自动高亮；你的原标注和笔记仍保留。</p>' : contextHTML(record,exam,expandContext)}<div class="annotation-editor-options"><label>类别<select id="annotation-kind">${kinds.map(k => `<option ${k===record.kind ? 'selected' : ''}>${k}</option>`).join('')}</select></label><label>关联题目<select id="annotation-question"><option value="">不关联题目</option>${sectionQuestions(section).map(q => `<option value="${q.number}" ${q.number===record.questionNumber ? 'selected' : ''}>第 ${q.number} 题</option>`).join('')}</select></label></div><label class="annotation-note-label" for="annotation-note">自己的理解 / 易错点</label><textarea id="annotation-note" class="annotation-note-input" rows="5" maxlength="20000" placeholder="例如：把 however 后的转折看反了；下次先找转折后的作者态度。">${esc(record.note)}</textarea><p class="annotation-local-note">标注保存在当前浏览器。可以从“我的标注”导出，留作复习或换设备。</p>${existing ? '<div class="annotation-delete-confirm" hidden><p>确定删除这条标注和笔记？</p>'+actionButton('confirm-delete','确定删除')+actionButton('cancel-delete','保留')+'</div>' : ''}`,`${existing ? actionButton('ask-delete','删除标注') : ''}${actionButton('close','取消')}${actionButton('save','保存标注',true)}`);
    editor = {record:{...record},returnToList,existing,stale};
    node.querySelector('#annotation-note')?.focus({preventScroll:true});
  }
  function count(examId=context?.exam.id,sectionId) {
    const exam = byExam(examId); return records(exam).filter(r => visibleRecord(r) && (sectionId == null || r.sectionId === sectionId)).length;
  }
  const scoped = scope => context ? records(context.exam).filter(r => visibleRecord(r) && (scope==='all' || r.sectionId === context.section.id)) : [];
  function openList(options={}) {
    if (!context) return;
    if (options.scope === 'all' || options.scope === 'section') listScope = options.scope;
    clearSelection(); const {exam,section} = context, list = scoped(listScope).slice().sort((a,b) => b.createdAt.localeCompare(a.createdAt));
    dialog('我的词句与做题经验',`<div class="annotation-list-tools"><div class="annotation-scope" role="group" aria-label="标注范围"><button type="button" data-annotation-action="scope-section" aria-pressed="${listScope==='section'}">本篇 ${count(exam.id,section.id)}</button><button type="button" data-annotation-action="scope-all" aria-pressed="${listScope==='all'}">全卷 ${count(exam.id)}</button></div><div class="annotation-export-tools">${actionButton('export-md','导出 Markdown')}${actionButton('export-json','导出 JSON')}<label class="annotation-button annotation-import-label">导入标注<input id="annotation-import-file" type="file" accept="application/json,.json"></label></div></div><p class="annotation-list-caption">${listScope==='all' ? esc(exam.title)+' · 全部篇目' : esc(section.title)} · ${list.length} 条${storageProblems.has(exam.id) ? ' · 暂未写入浏览器，请导出备份' : ''}</p><div class="annotation-records">${list.length ? list.map(r => { const s = bySection(exam,r.sectionId), stale = !anchoredCorrectly(exam,r); return `<article class="annotation-record" data-annotation-record="${esc(r.id)}"><div class="annotation-record-top"><span class="annotation-kind-label">${esc(r.kind)}</span><span>${esc(s?.title || r.sectionId)}${r.paragraphIndex !== null ? ' · 第'+(r.paragraphIndex+1)+'段' : ''}${r.questionNumber ? ' · 第'+r.questionNumber+'题' : ''}</span><button type="button" class="annotation-record-edit" data-annotation-action="edit" data-annotation-id="${esc(r.id)}">编辑</button></div>${r.quote ? `<p class="annotation-quote" lang="en">${esc(r.quote)}</p>` : '<p class="annotation-question-context">第 '+r.questionNumber+' 题笔记</p>'}${r.note ? `<p class="annotation-record-note">${esc(r.note)}</p>` : '<p class="annotation-note-empty">已高亮，点击“编辑”补一句自己的理解。</p>'}${stale ? '<p class="annotation-warning">原文已更新，笔记保留，暂不自动高亮。</p>' : ''}</article>`; }).join('') : '<div class="annotation-empty">阅读时用鼠标选中一个词、短语或句子，<br>点击“高亮”或“笔记 / 就地对照”。<br><span>对答案时也可以点“记错因”，把这次的判断留下来。</span></div>'}</div>`,actionButton('close','回到做题',true),'annotation-list-dialog');
  }
  function downloadable(scope) {
    if (!context) return null;
    return {format:'english-exam-annotations',schemaVersion:1,examId:context.exam.id,title:context.exam.title,scope:scope==='all' ? 'all' : context.section.id,exportedAt:new Date().toISOString(),annotations:scoped(scope).map(r => ({...r}))};
  }
  function download(format) {
    const data = downloadable(listScope); if (!data) return;
    if (!data.annotations.length) { notify('当前范围还没有标注。'); return; }
    const exam = context.exam;
    let content,extension,mime;
    if (format === 'json') { content = JSON.stringify(data,null,2); extension='json'; mime='application/json'; }
    else {
      content = '# '+exam.title+' · 我的词句与做题经验\n\n'+(listScope==='all' ? '范围：全卷' : '范围：'+context.section.title)+'\n\n';
      for (const [i,r] of data.annotations.entries()) {
        const section = bySection(exam,r.sectionId), paragraph = sourceParagraph(exam,r);
        content += '## '+(i+1)+'. '+r.kind+' · '+section.title+(r.questionNumber ? ' · 第'+r.questionNumber+'题' : '')+'\n\n';
        if (r.quote) content += '> '+r.quote.replace(/\n/g,'\n> ')+'\n\n';
        content += '我的理解：'+(r.note || '（待补充）')+'\n\n';
        if (paragraph?.zh) content += '本段译文（语境对照）：'+paragraph.zh+'\n\n';
        content += '记录时间：'+r.createdAt+'\n\n';
      }
      extension='md';mime='text/markdown';
    }
    const blob = new Blob([content],{type:mime+';charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;link.download=exam.id+'-'+(listScope==='all' ? 'all' : context.section.id)+'-annotations.'+extension;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    notify(format==='json' ? '已导出标注 JSON，可在另一设备导入。' : '已导出 Markdown，包含原文、自己的笔记和本段译文。');
  }
  function openQuestionNote(number,evidence) {
    if (!context) return;
    const section = context.exam.sections.find(s => s.questions.some(q => q.number === number));
    const question = section?.questions.find(q => q.number === number); if (!question) return;
    const e = evidence || question.evidence?.[0], paragraph = section.paragraphs[e?.paragraphIndex];
    let record;
    if (e && paragraph && typeof e.text === 'string' && paragraph.en.includes(e.text)) {
      const start = paragraph.en.indexOf(e.text);
      record = freshRecord({examId:context.exam.id,sectionId:section.id,paragraphIndex:e.paragraphIndex,start,end:start+e.text.length,quote:e.text},'错因',number);
    } else record = freshRecord({examId:context.exam.id,sectionId:section.id,paragraphIndex:null,start:null,end:null,quote:''},'错因',number);
    const existing = records(context.exam).find(r => r.sectionId === section.id && r.questionNumber === number && r.kind === '错因');
    openEditor(existing ? {...existing,highlighted:true} : record,{expandContext:true});
  }
  function mount({exam,section,root}) {
    if (!exam || !section || !root?.querySelectorAll) return;
    const changed = context && (context.exam.id!==exam.id || context.section.id!==section.id);
    if (changed) closeDialog(); hideToolbar();
    context={exam,section,root}; records(exam); paint();
  }
  function unmount() { context=null;clearTimeout(selectionTimer);hideToolbar();closeDialog(); }
  document.addEventListener('mouseup',event => {
    if (event.target.closest('#exam-selection-toolbar, #exam-annotation-dialog')) return;
    clearTimeout(selectionTimer);selectionTimer=setTimeout(()=>updateToolbar(true),0);
  });
  document.addEventListener('selectionchange',() => { clearTimeout(selectionTimer);selectionTimer=setTimeout(()=>updateToolbar(false),100); });
  document.addEventListener('scroll',event => { if (event.target.closest?.('#exam-annotation-dialog')) return; hideToolbar(); },true);
  window.addEventListener('resize',hideToolbar);
  document.addEventListener('click',event => {
    const control = event.target.closest('[data-annotation-action]');
    if (control) {
      const action = control.dataset.annotationAction; event.preventDefault();
      if (action === 'close') { closeDialog();return; }
      if (action === 'dismiss-selection') { clearSelection();return; }
      if (action === 'highlight' && candidate) {
        const selection={...candidate},affected=selectedHighlights(selection),now=new Date().toISOString();clearSelection();
        if(affected.length){
          for(const record of affected){record.highlighted=false;record.updatedAt=now;}
          persist(context.exam);paint();notify('已取消高亮，笔记仍保留。');return;
        }
        const previous=records(context.exam).filter(r=>r.highlighted===false&&r.sectionId===selection.sectionId&&r.paragraphIndex===selection.paragraphIndex&&r.start===selection.start&&r.end===selection.end&&r.quote===selection.quote);
        if(previous.length){for(const record of previous){record.highlighted=true;record.updatedAt=now;}persist(context.exam);paint();notify('已重新高亮，原有笔记保留。');return;}
        const saved=insert(freshRecord(selection));if(saved)notify('已高亮保存。点击高亮文字可补充笔记。');return;
      }
      if (action === 'selection-note' && candidate) { const record=freshRecord(candidate,candidate.quote.split(/\s+/).length>12 ? '难句' : '词语');openEditor(record,{expandContext:true});return; }
      if (!context) return;
      if (action === 'scope-section' || action === 'scope-all') { openList({scope:action==='scope-all' ? 'all' : 'section'});return; }
      if (action === 'export-md' || action === 'export-json') { download(action==='export-json' ? 'json' : 'md');return; }
      if (action === 'edit') { const record=records(context.exam).find(r=>r.id===control.dataset.annotationId);if(record)openEditor(record,{returnToList:true});return; }
      if (action === 'save' && editor) {
        const {record,returnToList,stale}=editor,exam=byExam(record.examId),note=$('#annotation-note').value.trim();
        if (record.paragraphIndex===null && !note) { notify('题目笔记里写一句自己的理解再保存。');return; }
        const next={...record,note,kind:$('#annotation-kind').value,questionNumber:$('#annotation-question').value ? Number($('#annotation-question').value) : null,updatedAt:new Date().toISOString()};
        if (next.paragraphIndex===null && !next.questionNumber) { notify('题目笔记需要保留关联题号。');return; }
        if (stale) {
          const i=records(exam).findIndex(r=>r.id===record.id);if(i>=0)records(exam)[i]=validShape(next,exam);persist(exam);
        } else insert(next);
        closeDialog();if(returnToList)openList();notify(storageProblems.has(exam.id) ? '笔记已留在本次页面，请导出备份。' : '标注与自己的理解已保存。');return;
      }
      if (action === 'ask-delete') { const box=$('.annotation-delete-confirm');if(box)box.hidden=false;return; }
      if (action === 'cancel-delete') { const box=$('.annotation-delete-confirm');if(box)box.hidden=true;return; }
      if (action === 'confirm-delete' && editor) {
        const {record,returnToList}=editor,exam=byExam(record.examId);cache.set(exam.id,records(exam).filter(r=>r.id!==record.id));persist(exam);paint();closeDialog();if(returnToList)openList();notify('已删除这条标注。');return;
      }
      return;
    }
    const mark=event.target.closest('mark[data-exam-annotation]');
    if (mark && context && context.root.contains(mark) && window.getSelection()?.isCollapsed) {
      const ids=mark.dataset.examAnnotation.split(','),record=records(context.exam).find(r=>ids.includes(r.id));
      if(record)openEditor(record,{expandContext:false});
    }
  });
  document.addEventListener('change',async event => {
    if(event.target.id!=='annotation-import-file' || !context)return;
    const file=event.target.files?.[0];if(!file)return;
    if(file.size>5000000){notify('文件过大，请选择导出的标注 JSON。');return;}
    const exam=context.exam;
    try{
      const raw=JSON.parse(await file.text());
      if(raw.format!=='english-exam-annotations' || raw.schemaVersion!==1 || raw.examId!==exam.id || !Array.isArray(raw.annotations) || raw.annotations.length>10000)throw Error('请导入属于当前试卷的标注 JSON 文件。');
      const incoming=raw.annotations.map(r=>validShape(r,exam));
      if(incoming.some(r=>!anchoredCorrectly(exam,r)))throw Error('部分标注与当前原文不一致，未导入。现有笔记保持不变。');
      const merged=new Map(records(exam).map(r=>[r.id,r]));let added=0,updated=0;
      for(const record of incoming){
        const old=merged.get(record.id);
        if(!old){merged.set(record.id,record);added++;}
        else if(old.sectionId!==record.sectionId || old.start!==record.start || old.end!==record.end || old.quote!==record.quote){
          const duplicate=[...merged.values()].some(r=>r.sectionId===record.sectionId&&r.paragraphIndex===record.paragraphIndex&&r.start===record.start&&r.end===record.end&&r.quote===record.quote&&r.note===record.note&&r.kind===record.kind&&r.questionNumber===record.questionNumber);
          if(!duplicate){const id=uid();merged.set(id,{...record,id});added++;}
        }
        else if(record.updatedAt>old.updatedAt){merged.set(record.id,record);updated++;}
      }
      cache.set(exam.id,[...merged.values()]);persist(exam);paint();openList();notify('已合并标注：新增 '+added+' 条，更新 '+updated+' 条。');
    }catch(error){notify(error instanceof SyntaxError ? '文件不是有效的 JSON。' : error.message);}
  });
  window.ExamAnnotations={mount,unmount,openList,count,openQuestionNote,openForEvidence:(number,evidence)=>openQuestionNote(number,evidence),getAnnotations:(examId,sectionId)=>{const exam=byExam(examId);return records(exam).filter(r=>sectionId==null||r.sectionId===sectionId).map(r=>({...r}));},exportData:(scope='all')=>downloadable(scope)};
})();
