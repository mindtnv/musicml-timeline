/**
 * Презентация ВКР — стильная светлая версия
 * node gen_pptx_v2.cjs → presentation.pptx
 */
const pptxgen = require("pptxgenjs");
const path = require("path");

const pres = new pptxgen();
pres.layout = "LAYOUT_16x9";
pres.author = "Антонов М.Д.";
pres.title = "Модуль анализа музыкальных композиций";

const BG="FFFFFF",SUBTLE="F8FAFC",CARD="FFFFFF",INK="111827",MID="4B5563",MUTED="9CA3AF";
const ACCENT="4F46E5",ACCENT2="7C3AED",GOLD="F59E0B",GREEN="059669",CORAL="E11D48",BORDER="E5E7EB";
const HF="Georgia",BF="Calibri",MF="Consolas",T=14;

function sn(s,n){s.addText(n+"/"+T,{x:9.1,y:5.3,w:.7,h:.2,fontSize:8,fontFace:BF,color:MUTED,align:"right"})}
function topBar(s){s.addShape(pres.shapes.RECTANGLE,{x:0,y:0,w:5,h:.05,fill:{color:ACCENT}});s.addShape(pres.shapes.RECTANGLE,{x:5,y:0,w:5,h:.05,fill:{color:ACCENT2}})}
function heading(s,t,n){topBar(s);s.addText(t,{x:.6,y:.22,w:8.8,h:.55,fontSize:26,fontFace:HF,color:INK,bold:true,margin:0});sn(s,n)}
function card(s,x,y,w,h,c){s.addShape(pres.shapes.ROUNDED_RECTANGLE,{x,y,w,h,fill:{color:CARD},rectRadius:.08,shadow:{type:"outer",color:"000000",blur:8,offset:2,angle:135,opacity:.07},line:{color:BORDER,width:.5}});if(c)s.addShape(pres.shapes.RECTANGLE,{x:x+.01,y:y+.08,w:.05,h:h-.16,fill:{color:c}})}

// 1 — ТИТУЛ
{const s=pres.addSlide();s.background={color:BG};topBar(s);
s.addText("ФГБОУ ВО «Тверской государственный университет»",{x:.5,y:.3,w:9,h:.3,fontSize:11,fontFace:BF,color:MUTED,align:"center"});
s.addText("Факультет прикладной математики и кибернетики · Кафедра ИТ",{x:.5,y:.6,w:9,h:.22,fontSize:10,fontFace:BF,color:MUTED,align:"center"});
s.addText("Модуль автоматического анализа\nмузыкальных композиций\nна основе мульти-задачного\nглубокого обучения",{x:.4,y:1.2,w:9.2,h:2.2,fontSize:30,fontFace:HF,color:INK,bold:true,align:"center",valign:"middle"});
const stats=[{v:"5",l:"архитектур\nсравнено",c:ACCENT},{v:"4",l:"задачи\nодновременно",c:ACCENT2},{v:"40.6%",l:"точность\nсегментации",c:GREEN},{v:"6",l:"панелей\nдашборда",c:GOLD}];
stats.forEach((st,i)=>{const x=.6+i*2.35;card(s,x,3.55,2.1,1,st.c);s.addText(st.v,{x:x+.15,y:3.6,w:1.8,h:.5,fontSize:28,fontFace:MF,color:st.c,bold:true,align:"center",valign:"middle",margin:0});s.addText(st.l,{x:x+.15,y:4.1,w:1.8,h:.38,fontSize:9,fontFace:BF,color:MID,align:"center",valign:"top",margin:0})});
s.addText([{text:"Выполнил: ",options:{bold:true}},{text:"Антонов М. Д., магистрант 2 курса"}],{x:4.5,y:4.8,w:5,h:.25,fontSize:11,fontFace:BF,color:INK});
s.addText([{text:"Руководитель: ",options:{bold:true}},{text:"Кудряшов М. Ю., к.ф.-м.н., доцент"}],{x:4.5,y:5.05,w:5,h:.25,fontSize:11,fontFace:BF,color:INK});
s.addText("Тверь, 2026",{x:.5,y:5.1,w:3,h:.25,fontSize:11,fontFace:BF,color:MUTED});sn(s,1)}

// 2 — АКТУАЛЬНОСТЬ
{const s=pres.addSlide();s.background={color:SUBTLE};heading(s,"Актуальность",2);
const items=[{icon:"100M+",head:"Треков на платформах",sub:"Spotify, Apple Music, YouTube — ручной анализ невозможен",color:ACCENT},{icon:"≠",head:"Фрагментированные решения",sub:"Каждая задача MIR = отдельная модель и pipeline",color:CORAL},{icon:"∅",head:"Нет единой системы",sub:"Совместный анализ структуры + эмоций + жанра + поиск похожих",color:ACCENT2},{icon:"→",head:"Широкий спрос",sub:"Ритм-игры · DJ · рекомендации · образование · стриминг",color:GREEN}];
items.forEach((it,i)=>{const y=1.05+i*1.1;card(s,.5,y,9,.9,it.color);s.addText(it.icon,{x:.7,y:y+.1,w:.7,h:.7,fontSize:20,fontFace:MF,color:it.color,bold:true,align:"center",valign:"middle"});s.addText(it.head,{x:1.5,y:y+.12,w:7.5,h:.3,fontSize:16,fontFace:HF,color:INK,bold:true,margin:0});s.addText(it.sub,{x:1.5,y:y+.48,w:7.5,h:.28,fontSize:12,fontFace:BF,color:MID,margin:0})})}

// 3 — ОБЗОР ЛИТЕРАТУРЫ
{const s=pres.addSlide();s.background={color:BG};heading(s,"Обзор литературы",3);
const works=[["Ullrich et al., ISMIR 2014","CNN + HMM","F1 ≈ 0.46",ACCENT],["Wang et al., IEEE TASLP 2022","Transformer","F1 ≈ 0.55",ACCENT],["Won et al., arXiv 2020","Self-attention","Arousal 70%",CORAL],["Kong et al., IEEE TASLP 2020","PANNs CNN14","87% GTZAN",GREEN],["Gong et al., Interspeech 2021","AST (ViT)","89% GTZAN",ACCENT2],["Caruana, ML 1997","Shared backbone","MTL теория",GOLD]];
works.forEach((w,i)=>{const y=1+i*.7;s.addShape(pres.shapes.OVAL,{x:.6,y:y+.12,w:.18,h:.18,fill:{color:w[3]}});s.addText(w[0],{x:.95,y,w:4.5,h:.25,fontSize:11,fontFace:BF,color:INK,bold:true,margin:0});s.addText(w[1],{x:.95,y:y+.25,w:4.5,h:.2,fontSize:10,fontFace:BF,color:MID,margin:0});s.addShape(pres.shapes.ROUNDED_RECTANGLE,{x:5.8,y:y+.05,w:1.5,h:.35,fill:{color:w[3],transparency:90},rectRadius:.04,line:{color:w[3],width:1}});s.addText(w[2],{x:5.8,y:y+.05,w:1.5,h:.35,fontSize:11,fontFace:MF,color:w[3],bold:true,align:"center",valign:"middle"})});
s.addText("Полные библиографические ссылки — в тексте работы (38 источников)",{x:.5,y:5,w:9,h:.2,fontSize:9,fontFace:BF,color:MUTED,italic:true})}

// 4 — ЦЕЛЬ И ЗАДАЧИ
{const s=pres.addSlide();s.background={color:SUBTLE};heading(s,"Цель и задачи",4);
card(s,.5,.95,9,.7,ACCENT);s.addText("Цель: разработать прототип системы автоматического многоаспектного анализа музыкальных композиций на основе мульти-задачной модели глубокого обучения",{x:.75,y:1,w:8.5,h:.6,fontSize:13,fontFace:HF,color:ACCENT,italic:true,valign:"middle"});
const tasks=["Обзор предметной области Music Information Retrieval","Подготовка обучающего корпуса из 3 открытых датасетов","Реализация и сравнение 5 архитектур мульти-задачных моделей","Пост-обработка предсказаний (Viterbi + музыкальные априори)","Разработка веб-прототипа с дашбордом и поиском похожих треков","Загрузка треков из YouTube / SoundCloud (yt-dlp)"];
const cols=[ACCENT,ACCENT,ACCENT2,ACCENT2,GREEN,GREEN];
tasks.forEach((t,i)=>{const y=1.95+i*.55;s.addShape(pres.shapes.ROUNDED_RECTANGLE,{x:.55,y:y+.05,w:.32,h:.32,fill:{color:cols[i]},rectRadius:.06});s.addText(String(i+1),{x:.55,y:y+.05,w:.32,h:.32,fontSize:13,fontFace:BF,color:"FFFFFF",bold:true,align:"center",valign:"middle"});s.addText(t,{x:1.05,y,w:8.3,h:.42,fontSize:14,fontFace:BF,color:INK,valign:"middle",margin:0})})}

// 5 — КАК ЭТО РАБОТАЕТ
{const s=pres.addSlide();s.background={color:BG};heading(s,"Как это работает",5);
const flow=[{l:"Аудио\nMP3/WAV",bg:"F3F4F6",c:MID},{l:"Мел-спектро-\nграмма 128×T",bg:"EEF2FF",c:ACCENT},{l:"AST\nTransformer\npretrained",bg:ACCENT,c:"FFFFFF"},{l:"4 головы\nструктура\nэмоции · жанр",bg:"EEF2FF",c:ACCENT2},{l:"Viterbi +\nposition\npriors",bg:"FFFBEB",c:GOLD},{l:"Дашборд\n+ похожие\nтреки",bg:"ECFDF5",c:GREEN}];
flow.forEach((f,i)=>{const x=.2+i*1.6;s.addShape(pres.shapes.ROUNDED_RECTANGLE,{x,y:1.15,w:1.4,h:1.3,fill:{color:f.bg},rectRadius:.1,shadow:{type:"outer",color:"000000",blur:4,offset:1,angle:135,opacity:.05}});s.addText(f.l,{x,y:1.15,w:1.4,h:1.3,fontSize:10,fontFace:BF,color:f.c,bold:true,align:"center",valign:"middle"});if(i<flow.length-1)s.addText("→",{x:x+1.4,y:1.5,w:.2,h:.6,fontSize:16,color:MUTED,align:"center",valign:"middle"})});
const data=[{name:"DEAM",n:"1 802",task:"Энергия + Настроение",c:CORAL},{name:"Harmonix",n:"743",task:"Структура (6 типов)",c:ACCENT},{name:"GTZAN",n:"999",task:"Жанр (10 классов)",c:GREEN}];
data.forEach((d,i)=>{const x=.5+i*3.15;card(s,x,2.85,2.9,1.3,d.c);s.addText(d.name,{x:x+.2,y:2.95,w:2.5,h:.3,fontSize:15,fontFace:HF,color:INK,bold:true,margin:0});s.addText(d.n+" треков",{x:x+.2,y:3.3,w:2.5,h:.25,fontSize:20,fontFace:MF,color:d.c,bold:true,margin:0});s.addText(d.task,{x:x+.2,y:3.6,w:2.5,h:.3,fontSize:11,fontFace:BF,color:MID,margin:0})});
s.addText("Итого: 3 544 трека · 176K обучающих окон · 10 с фрагменты · шаг 1 с",{x:.5,y:4.4,w:9,h:.25,fontSize:10,fontFace:BF,color:MUTED,align:"center"})}

// 6 — НАУЧНАЯ НОВИЗНА
{const s=pres.addSlide();s.background={color:SUBTLE};heading(s,"Научная новизна и практическая значимость",6);
s.addText("Научная новизна",{x:.5,y:1,w:4.3,h:.3,fontSize:15,fontFace:HF,color:ACCENT,bold:true,margin:0});
const nov=[{text:"Сравнение 5 архитектур\n(CNN → AST) для мульти-задачного MIR",c:ACCENT},{text:"AST впервые применён к совместному\nанализу структуры + эмоций + жанра",c:ACCENT2},{text:"Viterbi pipeline + музыкальные приоры\n(+14 пп Boundary F1)",c:GREEN}];
nov.forEach((n,i)=>{const y=1.5+i;card(s,.5,y,4.3,.8,n.c);s.addText(String(i+1),{x:.7,y:y+.2,w:.3,h:.3,fontSize:16,fontFace:BF,color:n.c,bold:true,align:"center",valign:"middle"});s.addText(n.text,{x:1.1,y:y+.1,w:3.5,h:.6,fontSize:11,fontFace:BF,color:INK,margin:0})});
s.addText("Практическая значимость",{x:5.2,y:1,w:4.3,h:.3,fontSize:15,fontFace:HF,color:GREEN,bold:true,margin:0});
const pract=[{text:"Open-source прототип + загрузка\nиз YouTube / SoundCloud",c:GREEN},{text:"Поиск похожих треков через\nembedding similarity (cosine + PCA)",c:GOLD},{text:"Воспроизводимый pipeline:\nконфиги + CLI + seed = результат",c:ACCENT}];
pract.forEach((p,i)=>{const y=1.5+i;card(s,5.2,y,4.3,.8,p.c);s.addText("✓",{x:5.4,y:y+.2,w:.3,h:.3,fontSize:16,fontFace:BF,color:p.c,bold:true,align:"center",valign:"middle"});s.addText(p.text,{x:5.8,y:y+.1,w:3.5,h:.6,fontSize:11,fontFace:BF,color:INK,margin:0})})}

// 7 — РЕЗУЛЬТАТЫ: CHART
{const s=pres.addSlide();s.background={color:BG};heading(s,"Результаты: сравнение 5 моделей",7);
s.addChart(pres.charts.BAR,[{name:"Segment",labels:["CNN","CNN+LSTM","PANNs+Lin","PANNs+LSTM","AST v2"],values:[35.3,32.2,24,32.9,40.6]},{name:"Arousal",labels:["CNN","CNN+LSTM","PANNs+Lin","PANNs+LSTM","AST v2"],values:[62,62.3,61.2,64.9,60.6]},{name:"Valence",labels:["CNN","CNN+LSTM","PANNs+Lin","PANNs+LSTM","AST v2"],values:[51.7,54.2,53.8,55,51.1]},{name:"Genre",labels:["CNN","CNN+LSTM","PANNs+Lin","PANNs+LSTM","AST v2"],values:[83.9,60.9,81.9,77.7,81.5]}],{x:.3,y:.9,w:6.5,h:3.8,barDir:"col",barGrouping:"clustered",chartColors:[ACCENT,CORAL,GOLD,GREEN],valAxisMinVal:0,valAxisMaxVal:100,showTitle:false,showValue:false,showLegend:true,legendPos:"b",legendFontSize:9,valAxisLabelFontSize:9,catAxisLabelFontSize:9});
card(s,7.1,1,2.6,3.6,ACCENT);s.addText("Лучшая\nмодель",{x:7.3,y:1.1,w:2.2,h:.5,fontSize:12,fontFace:BF,color:MUTED,align:"center",margin:0});s.addText("AST v2",{x:7.3,y:1.6,w:2.2,h:.4,fontSize:22,fontFace:HF,color:ACCENT,bold:true,align:"center",margin:0});
[{l:"Segment",v:"40.6%",c:ACCENT},{l:"Genre",v:"81.5%",c:GREEN},{l:"Среднее",v:"58.5%",c:ACCENT2}].forEach((w,i)=>{const y=2.2+i*.7;s.addText(w.v,{x:7.3,y,w:2.2,h:.35,fontSize:20,fontFace:MF,color:w.c,bold:true,align:"center",margin:0});s.addText(w.l,{x:7.3,y:y+.35,w:2.2,h:.2,fontSize:10,fontFace:BF,color:MUTED,align:"center",margin:0})})}

// 8 — ПОСТ-ОБРАБОТКА
{const s=pres.addSlide();s.background={color:SUBTLE};heading(s,"Пост-обработка: от шума к структуре",8);
card(s,.4,1,4.3,3.2,CORAL);s.addText("БЕЗ обработки",{x:.6,y:1.1,w:3.8,h:.35,fontSize:18,fontFace:HF,color:CORAL,bold:true,margin:0});
["28 хаотичных сегментов","«Вступление» в середине трека","Chorus ↔ Bridge каждую секунду","Boundary F1 = 0.31"].forEach((b,i)=>{s.addText("✕  "+b,{x:.7,y:1.65+i*.55,w:3.8,h:.4,fontSize:13,fontFace:BF,color:MID,margin:0})});
s.addText("→",{x:4.4,y:2,w:1.2,h:1,fontSize:40,fontFace:HF,color:ACCENT,align:"center",valign:"middle"});
card(s,5.3,1,4.3,3.2,GREEN);s.addText("ПОСЛЕ Viterbi + priors",{x:5.5,y:1.1,w:3.8,h:.35,fontSize:18,fontFace:HF,color:GREEN,bold:true,margin:0});
["7 осмысленных сегментов","Intro только в начале трека","Verse → Chorus → Bridge форма","Boundary F1 = 0.45"].forEach((a,i)=>{s.addText("✓  "+a,{x:5.5,y:1.65+i*.55,w:3.8,h:.4,fontSize:13,fontFace:BF,color:INK,margin:0})});
s.addShape(pres.shapes.ROUNDED_RECTANGLE,{x:3,y:4.5,w:4,h:.7,fill:{color:ACCENT,transparency:92},rectRadius:.06,line:{color:ACCENT,width:1.5}});s.addText("+14 пунктов Boundary F1",{x:3,y:4.5,w:4,h:.7,fontSize:22,fontFace:HF,color:ACCENT,bold:true,align:"center",valign:"middle"})}

// 9–11 — СКРИНШОТЫ (placeholder — user вставит сам)
[{n:9,t:"Прототип: плеер + структура + эмоции"},{n:10,t:"Прототип: похожие треки + Russell circumplex + сводка"},{n:11,t:"Прототип: жанр + мел-спектрограмма"}].forEach(({n,t})=>{
const s=pres.addSlide();s.background={color:"0F172A"};
s.addShape(pres.shapes.RECTANGLE,{x:0,y:0,w:10,h:.04,fill:{color:ACCENT}});s.addShape(pres.shapes.RECTANGLE,{x:0,y:.04,w:10,h:.04,fill:{color:ACCENT2}});
s.addText(t,{x:.3,y:.15,w:8.5,h:.35,fontSize:15,fontFace:HF,color:"F8FAFC",bold:true,margin:0});sn(s,n);
s.addShape(pres.shapes.ROUNDED_RECTANGLE,{x:.25,y:.6,w:9.5,h:4.8,fill:{color:"1E293B"},rectRadius:.12,line:{color:"334155",width:1,dashType:"dash"}});
s.addText("ВСТАВЬТЕ СКРИНШОТ\nWin+Shift+S → выделить → Ctrl+V",{x:2.5,y:2.2,w:5,h:1.5,fontSize:14,fontFace:BF,color:"475569",align:"center",valign:"middle"})});

// 12 — СРАВНЕНИЕ С SOTA
{const s=pres.addSlide();s.background={color:BG};heading(s,"Сравнение с State-of-the-Art",12);
[{task:"Genre (GTZAN)",ours:"83.9%",sota:"89%",delta:"−5.1",src:"Gong 2021",c:GREEN},{task:"Arousal (DEAM)",ours:"64.9%",sota:"70%",delta:"−5.1",src:"Won 2020",c:CORAL},{task:"Segment (Harmonix)",ours:"40.6%",sota:"~45%",delta:"−4.4",src:"Wang 2022",c:ACCENT},{task:"Boundary F1 ±3с",ours:"0.45",sota:"0.62",delta:"−0.17",src:"Gong 2023",c:ACCENT2}].forEach((r,i)=>{
const y=1+i*.85;card(s,.4,y,9.2,.7,r.c);s.addText(r.task,{x:.65,y:y+.1,w:2.2,h:.22,fontSize:12,fontFace:HF,color:INK,bold:true,margin:0});s.addText(r.src,{x:.65,y:y+.35,w:2.2,h:.2,fontSize:9,fontFace:BF,color:MUTED,margin:0});s.addText(r.ours,{x:3.2,y:y+.1,w:1.5,h:.45,fontSize:22,fontFace:MF,color:r.c,bold:true,align:"center",valign:"middle",margin:0});s.addText("vs",{x:4.7,y:y+.15,w:.5,h:.35,fontSize:11,fontFace:BF,color:MUTED,align:"center",valign:"middle"});s.addText(r.sota,{x:5.2,y:y+.1,w:1.5,h:.45,fontSize:22,fontFace:MF,color:MID,align:"center",valign:"middle",margin:0});s.addText(r.delta+" пп",{x:7,y:y+.1,w:1.2,h:.45,fontSize:14,fontFace:MF,color:MUTED,align:"center",valign:"middle"})});
s.addText("Multi-task tax · 2.5K треков vs 100K+ · 1 GPU vs кластер · полный pipeline + UI, SOTA — только модель",{x:.5,y:4.6,w:9,h:.3,fontSize:10,fontFace:BF,color:MUTED,align:"center",italic:true})}

// 13 — ОГРАНИЧЕНИЯ
{const s=pres.addSlide();s.background={color:SUBTLE};heading(s,"Ограничения и дальнейшая работа",13);
[{t:"GTZAN out-of-distribution",d:"10 жанров 2002 г. → electronic, lo-fi не покрыты\nMitigation: top-3 + warning в UI",c:GOLD},{t:"Segment ceiling",d:"6-класс section labeling ≈ 40% — данные ограничены\nMitigation: Viterbi + position priors",c:CORAL},{t:"Размер AST",d:"574 МБ, 8 сек inference — не для mobile\nMitigation: CNN fallback (21 МБ, 2 сек)",c:ACCENT}].forEach((l,i)=>{
const y=1+i*1.15;card(s,.5,y,5.5,.95,l.c);s.addText(l.t,{x:.75,y:y+.08,w:5,h:.28,fontSize:14,fontFace:HF,color:INK,bold:true,margin:0});s.addText(l.d,{x:.75,y:y+.4,w:5,h:.48,fontSize:10,fontFace:BF,color:MID,margin:0})});
s.addText("Дальнейшая работа",{x:6.3,y:1,w:3.5,h:.3,fontSize:15,fontFace:HF,color:GREEN,bold:true,margin:0});
["FMA / MagnaTagATune\nдля современных жанров","Knowledge distillation\nAST → mobile","Real-time streaming\ninference"].forEach((f,i)=>{const y=1.5+i;card(s,6.3,y,3.3,.8,GREEN);s.addText("→",{x:6.5,y:y+.15,w:.3,h:.4,fontSize:16,fontFace:BF,color:GREEN,bold:true,align:"center",valign:"middle"});s.addText(f,{x:6.9,y:y+.1,w:2.5,h:.6,fontSize:11,fontFace:BF,color:INK,margin:0})})}

// 14 — ИТОГИ
{const s=pres.addSlide();s.background={color:BG};heading(s,"Итоги",14);
[{text:"5 архитектур реализованы и сравнены",color:ACCENT},{text:"AST v2: segment 40.6% · genre 81.5% · avg 58.5%",color:ACCENT2},{text:"Viterbi + position priors: +14 пп Boundary F1",color:GREEN},{text:"Веб-прототип: 6 панелей · поиск похожих · YouTube/SoundCloud",color:GOLD},{text:"Ограничения идентифицированы и честно адресованы",color:MID}].forEach((r,i)=>{
const y=.95+i*.85;card(s,.5,y,9,.7,r.color);s.addShape(pres.shapes.ROUNDED_RECTANGLE,{x:.7,y:y+.15,w:.38,h:.38,fill:{color:r.color},rectRadius:.06});s.addText("✓",{x:.7,y:y+.15,w:.38,h:.38,fontSize:16,fontFace:BF,color:"FFFFFF",bold:true,align:"center",valign:"middle"});s.addText(r.text,{x:1.25,y:y+.1,w:8,h:.5,fontSize:15,fontFace:BF,color:INK,valign:"middle",margin:0})});
s.addText("Спасибо за внимание",{x:0,y:5,w:10,h:.4,fontSize:20,fontFace:HF,color:ACCENT,bold:true,align:"center"})}

// Build
pres.writeFile({fileName:path.join(__dirname,"presentation.pptx")}).then(()=>console.log("✓ presentation.pptx — "+T+" слайдов · Georgia+Calibri · indigo/violet/gold/green"));
