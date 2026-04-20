/**
 * Презентация ВКР v3 — с красной нитью
 * Тезис: один трансформер решает 4 задачи музыкального анализа
 */
const pptxgen = require("pptxgenjs");
const path = require("path");

const pres = new pptxgen();
pres.layout = "LAYOUT_16x9";
pres.author = "Антонов М.Д.";
pres.title = "Модуль анализа музыкальных композиций";

const BG="FFFFFF",SUB="F8FAFC",INK="111827",MID="4B5563",MUT="9CA3AF";
const A="4F46E5",A2="7C3AED",GO="F59E0B",GR="059669",CO="E11D48",BD="E5E7EB";
const HF="Georgia",BF="Calibri",MO="Consolas",T=13;

function sn(s,n){s.addText(n+"/"+T,{x:9.1,y:5.3,w:.7,h:.2,fontSize:8,fontFace:BF,color:MUT,align:"right"})}
function bar(s){s.addShape(pres.shapes.RECTANGLE,{x:0,y:0,w:5,h:.05,fill:{color:A}});s.addShape(pres.shapes.RECTANGLE,{x:5,y:0,w:5,h:.05,fill:{color:A2}})}
function hd(s,t,n){bar(s);s.addText(t,{x:.6,y:.22,w:8.8,h:.55,fontSize:26,fontFace:HF,color:INK,bold:true,margin:0});sn(s,n)}
function cd(s,x,y,w,h,c){s.addShape(pres.shapes.ROUNDED_RECTANGLE,{x,y,w,h,fill:{color:"FFFFFF"},rectRadius:.08,shadow:{type:"outer",color:"000000",blur:8,offset:2,angle:135,opacity:.07},line:{color:BD,width:.5}});if(c)s.addShape(pres.shapes.RECTANGLE,{x:x+.01,y:y+.08,w:.05,h:h-.16,fill:{color:c}})}

// ═══════════════════════════════════════════
// 1 — ТИТУЛ
// ═══════════════════════════════════════════
{const s=pres.addSlide();s.background={color:BG};bar(s);
s.addText("ФГБОУ ВО «Тверской государственный университет»\nФакультет прикладной математики и кибернетики · Кафедра ИТ",{x:.5,y:.25,w:9,h:.5,fontSize:10,fontFace:BF,color:MUT,align:"center"});
s.addText("Модуль автоматического анализа\nмузыкальных композиций\nна основе мульти-задачного\nглубокого обучения",{x:.4,y:1.1,w:9.2,h:2,fontSize:30,fontFace:HF,color:INK,bold:true,align:"center",valign:"middle"});
// Thesis statement — the RED THREAD
s.addShape(pres.shapes.ROUNDED_RECTANGLE,{x:1.5,y:3.2,w:7,h:.65,fill:{color:A,transparency:93},rectRadius:.06,line:{color:A,width:1}});
s.addText("Один предобученный трансформер одновременно понимает структуру, эмоции и жанр музыки",{x:1.7,y:3.22,w:6.6,h:.6,fontSize:14,fontFace:HF,color:A,italic:true,align:"center",valign:"middle"});
// Author block
s.addText([{text:"Выполнил: ",options:{bold:true}},{text:"Антонов М. Д., магистрант 2 курса"}],{x:4.5,y:4.3,w:5,h:.25,fontSize:11,fontFace:BF,color:INK});
s.addText([{text:"Руководитель: ",options:{bold:true}},{text:"Кудряшов М. Ю., к.ф.-м.н., доцент"}],{x:4.5,y:4.55,w:5,h:.25,fontSize:11,fontFace:BF,color:INK});
s.addText("Тверь, 2026",{x:.5,y:5.1,w:3,h:.25,fontSize:11,fontFace:BF,color:MUT});sn(s,1)}

// ═══════════════════════════════════════════
// 2 — ПРОБЛЕМА (зачем это нужно)
// ═══════════════════════════════════════════
{const s=pres.addSlide();s.background={color:SUB};hd(s,"Проблема: как анализировать 100M треков?",2);
// Left side: 4 separate tools = bad
s.addText("Сейчас — 4 отдельных модели:",{x:.5,y:1,w:4.5,h:.3,fontSize:14,fontFace:HF,color:CO,bold:true,margin:0});
["Структура → отдельная модель","Эмоции → отдельная модель","Жанр → отдельная модель","Похожие треки → отдельная модель"].forEach((t,i)=>{
  s.addText("✕  "+t,{x:.7,y:1.5+i*.55,w:4,h:.4,fontSize:13,fontFace:BF,color:MID,margin:0})});
s.addText("4 модели · 4 прогона · несогласованные результаты",{x:.7,y:3.8,w:4,h:.3,fontSize:11,fontFace:BF,color:CO,italic:true,margin:0});

// Arrow
s.addText("→",{x:4.6,y:2,w:.8,h:1.5,fontSize:40,fontFace:HF,color:A,align:"center",valign:"middle"});

// Right side: one model = our approach
s.addText("Наш подход — 1 модель:",{x:5.4,y:1,w:4.5,h:.3,fontSize:14,fontFace:HF,color:GR,bold:true,margin:0});
cd(s,5.3,1.4,4.3,2.6,GR);
["✓  Структура (6 типов сегментов)","✓  Энергия и настроение","✓  Жанр (10 классов)","✓  Похожие треки (по звучанию)"].forEach((t,i)=>{
  s.addText(t,{x:5.5,y:1.6+i*.55,w:3.8,h:.4,fontSize:13,fontFace:BF,color:INK,margin:0})});
s.addText("1 модель · 1 прогон · согласованная разметка",{x:5.5,y:3.5,w:3.8,h:.3,fontSize:11,fontFace:BF,color:GR,italic:true,margin:0})}

// ═══════════════════════════════════════════
// 3 — ОБЗОР ЛИТЕРАТУРЫ (кратко)
// ═══════════════════════════════════════════
{const s=pres.addSlide();s.background={color:BG};hd(s,"Обзор литературы",3);
const works=[
  ["Ullrich et al., ISMIR 2014","CNN + HMM для сегментации","F1 ≈ 0.46",A],
  ["Wang et al., IEEE TASLP 2022","Transformer для структуры","F1 ≈ 0.55",A],
  ["Won et al., arXiv 2020","Self-attention для эмоций","Arousal 70%",CO],
  ["Kong et al., IEEE TASLP 2020","PANNs CNN14, pretrained AudioSet","87% GTZAN",GR],
  ["Gong et al., Interspeech 2021","Audio Spectrogram Transformer","89% GTZAN",A2],
  ["Caruana, Machine Learning 1997","Multi-task learning теория","Shared backbone",GO]];
works.forEach((w,i)=>{const y=1+i*.65;
  s.addShape(pres.shapes.OVAL,{x:.6,y:y+.1,w:.16,h:.16,fill:{color:w[3]}});
  s.addText(w[0],{x:.9,y,w:3.5,h:.22,fontSize:10,fontFace:BF,color:INK,bold:true,margin:0});
  s.addText(w[1],{x:.9,y:y+.22,w:3.5,h:.2,fontSize:9,fontFace:BF,color:MID,margin:0});
  s.addShape(pres.shapes.ROUNDED_RECTANGLE,{x:5,y:y+.03,w:1.3,h:.32,fill:{color:w[3],transparency:90},rectRadius:.04,line:{color:w[3],width:1}});
  s.addText(w[2],{x:5,y:y+.03,w:1.3,h:.32,fontSize:10,fontFace:MO,color:w[3],bold:true,align:"center",valign:"middle"})});

// Key takeaway
s.addShape(pres.shapes.ROUNDED_RECTANGLE,{x:.5,y:4.8,w:9,h:.55,fill:{color:A,transparency:93},rectRadius:.06});
s.addText("Вывод: AST + multi-task + Viterbi post-processing — перспективная, но нереализованная комбинация",{x:.7,y:4.82,w:8.6,h:.5,fontSize:12,fontFace:BF,color:A,bold:true,align:"center",valign:"middle"})}

// ═══════════════════════════════════════════
// 4 — ЦЕЛЬ И ЗАДАЧИ
// ═══════════════════════════════════════════
{const s=pres.addSlide();s.background={color:SUB};hd(s,"Цель и задачи",4);
cd(s,.5,.95,9,.65,A);
s.addText("Цель: разработать прототип системы автоматического многоаспектного анализа музыкальных композиций на основе мульти-задачной модели глубокого обучения",{x:.75,y:1,w:8.5,h:.55,fontSize:13,fontFace:HF,color:A,italic:true,valign:"middle"});
const tasks=["Обзор предметной области MIR","Подготовка обучающего корпуса из 3 датасетов","Реализация и сравнение 5 архитектур мульти-задачных моделей","Пост-обработка предсказаний (Viterbi + музыкальные априори)","Разработка веб-прототипа с синхронизированным дашбордом"];
const cols=[A,A,A2,A2,GR];
tasks.forEach((t,i)=>{const y=1.9+i*.6;
  s.addShape(pres.shapes.ROUNDED_RECTANGLE,{x:.55,y:y+.05,w:.32,h:.32,fill:{color:cols[i]},rectRadius:.06});
  s.addText(String(i+1),{x:.55,y:y+.05,w:.32,h:.32,fontSize:13,fontFace:BF,color:"FFFFFF",bold:true,align:"center",valign:"middle"});
  s.addText(t,{x:1.05,y,w:8.3,h:.42,fontSize:14,fontFace:BF,color:INK,valign:"middle",margin:0})})}

// ═══════════════════════════════════════════
// 5 — АРХИТЕКТУРА AST: полная диаграмма (2 слайда)
// ═══════════════════════════════════════════

// --- Слайд 5a: Диаграмма модели ---
{const s=pres.addSlide();s.background={color:BG};hd(s,"Архитектура: Audio Spectrogram Transformer",5);

// Helper: box with label
function box(s,x,y,w,h,bg,label,sub,tc,fs){
  s.addShape(pres.shapes.ROUNDED_RECTANGLE,{x,y,w,h,fill:{color:bg},rectRadius:.06,
    shadow:{type:"outer",color:"000000",blur:4,offset:1,angle:135,opacity:.06},
    line:{color:bg===A||bg===A2||bg==="374151"?bg:BD,width:1}});
  s.addText(label,{x,y:sub?y+.03:y,w,h:sub?h*.55:h,fontSize:fs||10,fontFace:BF,color:tc||INK,bold:true,align:"center",valign:sub?"bottom":"middle",margin:0});
  if(sub)s.addText(sub,{x,y:y+h*.5,w,h:h*.45,fontSize:8,fontFace:BF,color:tc||MID,align:"center",valign:"top",margin:0});
}
// Helper: arrow (horizontal text arrow)
function arr(s,x,y,dir){
  const ch=dir==="down"?"↓":dir==="right"?"→":"→";
  s.addText(ch,{x,y,w:.3,h:.35,fontSize:16,fontFace:BF,color:MUT,align:"center",valign:"middle"});
}

// === LEFT COLUMN: Input pipeline ===
box(s, .3, .9, 1.8, .6, "F3F4F6", "Аудио (MP3/WAV)", "10-сек окна, шаг 1 с", MID);
arr(s, .95, 1.52, "down");
box(s, .3, 1.85, 1.8, .6, "EEF2FF", "Log-Mel спектрограмма", "128 мел-полос × 431 фреймов", A);
arr(s, .95, 2.47, "down");
box(s, .3, 2.8, 1.8, .6, "EDE9FE", "Patch Embedding", "Патчи 16×16 → 768-dim токены", A2);
arr(s, .95, 3.42, "down");
box(s, .3, 3.75, 1.8, .5, "F5F3FF", "+ CLS + Positional", "Обучаемые embeddings", A2);

// === CENTER: Transformer tower (main block) ===
// Frozen layers (8)
s.addShape(pres.shapes.ROUNDED_RECTANGLE,{x:2.6,y:.9,w:3.8,h:1.7,fill:{color:"F1F5F9"},rectRadius:.08,line:{color:"CBD5E1",width:1.5,dashType:"dash"}});
s.addText("❄ FROZEN",{x:2.7,y:.95,w:1.5,h:.25,fontSize:9,fontFace:MO,color:"6B7280",bold:true,margin:0});
// 8 small layer blocks
for(let i=0;i<8;i++){
  const lx=2.8+i*.44;
  s.addShape(pres.shapes.ROUNDED_RECTANGLE,{x:lx,y:1.3,w:.38,h:1.1,fill:{color:"E2E8F0"},rectRadius:.04});
  s.addText(String(i+1),{x:lx,y:1.3,w:.38,h:.35,fontSize:9,fontFace:MO,color:"6B7280",align:"center",valign:"middle"});
  s.addText("SA\nFF",{x:lx,y:1.65,w:.38,h:.6,fontSize:7,fontFace:MO,color:"9CA3AF",align:"center",valign:"middle"});
}

arr(s, 4.35, 2.62, "down");

// Trainable layers (4)
s.addShape(pres.shapes.ROUNDED_RECTANGLE,{x:2.6,y:2.9,w:3.8,h:1.5,fill:{color:"EDE9FE"},rectRadius:.08,line:{color:A2,width:1.5}});
s.addText("🔥 TRAINABLE",{x:2.7,y:2.95,w:1.8,h:.25,fontSize:9,fontFace:MO,color:A2,bold:true,margin:0});
// 4 bigger layer blocks
for(let i=0;i<4;i++){
  const lx=2.85+i*.88;
  s.addShape(pres.shapes.ROUNDED_RECTANGLE,{x:lx,y:3.3,w:.78,h:.9,fill:{color:A2},rectRadius:.06});
  s.addText("Layer "+(i+9),{x:lx,y:3.35,w:.78,h:.3,fontSize:8,fontFace:MO,color:"FFFFFF",bold:true,align:"center",valign:"middle"});
  s.addText("Multi-Head\nSelf-Attention\n+ FFN",{x:lx,y:3.65,w:.78,h:.5,fontSize:7,fontFace:BF,color:"E9D5FF",align:"center",valign:"middle"});
}

// Label under transformer
s.addText("12 Transformer Layers · 768-dim · 12 attention heads",{x:2.6,y:4.45,w:3.8,h:.2,fontSize:8,fontFace:BF,color:MUT,align:"center"});

// === RIGHT COLUMN: Output heads ===
// CLS token
box(s, 6.9, .9, 2.8, .5, "F5F3FF", "CLS Token → 768-dim", null, A2, 11);
arr(s, 8.15, 1.42, "down");

// Shared FC
box(s, 6.9, 1.7, 2.8, .45, "374151", "Shared FC: 768→256", "BN + ReLU + Dropout 0.4", "FFFFFF", 10);
arr(s, 8.15, 2.17, "down");

// 4 heads as a 2x2 grid
const heads=[
  {l:"Segment",sub:"6 классов\nIntro·Verse·Chorus\nBridge·Instr·Outro",c:A,x:6.9,y:2.5},
  {l:"Arousal",sub:"3 класса\nLow·Mid·High",c:CO,x:8.45,y:2.5},
  {l:"Valence",sub:"3 класса\nDark·Neutral·Bright",c:GO,x:6.9,y:3.6},
  {l:"Genre",sub:"10 классов\nblues·classical·...\npop·rock",c:GR,x:8.45,y:3.6},
];
heads.forEach(h=>{
  s.addShape(pres.shapes.ROUNDED_RECTANGLE,{x:h.x,y:h.y,w:1.4,h:.95,fill:{color:h.c,transparency:88},rectRadius:.06,line:{color:h.c,width:1.5}});
  s.addText(h.l,{x:h.x,y:h.y+.02,w:1.4,h:.28,fontSize:11,fontFace:BF,color:h.c,bold:true,align:"center",valign:"middle"});
  s.addText(h.sub,{x:h.x,y:h.y+.3,w:1.4,h:.6,fontSize:7,fontFace:BF,color:MID,align:"center",valign:"top"});
});

// Arrows from input column to transformer
s.addShape(pres.shapes.LINE,{x:2.1,y:2,w:.5,h:0,line:{color:MUT,width:1.5}});
s.addText("→",{x:2.3,y:1.85,w:.3,h:.3,fontSize:14,color:MUT,align:"center",valign:"middle"});

// Arrow from transformer to output
s.addShape(pres.shapes.LINE,{x:6.4,y:2,w:.5,h:0,line:{color:MUT,width:1.5}});
s.addText("→",{x:6.55,y:1.85,w:.3,h:.3,fontSize:14,color:MUT,align:"center",valign:"middle"});

// Key numbers at bottom
s.addText("87M параметров всего · 14M обучаемых (freeze 8/12) · pretrained на AudioSet (2M клипов, 527 звуков)",{x:.3,y:4.85,w:9.4,h:.25,fontSize:10,fontFace:BF,color:MUT,align:"center",bold:true});
s.addText("Также сравнивали с CNN (SE), CNN+BiLSTM, PANNs+Linear, PANNs+BiLSTM — AST лучший по среднему (→ результаты)",{x:.3,y:5.1,w:9.4,h:.2,fontSize:9,fontFace:BF,color:MUT,align:"center",italic:true})}

// ═══════════════════════════════════════════
// 6 — ДАННЫЕ (кратко, 1 слайд)
// ═══════════════════════════════════════════
{const s=pres.addSlide();s.background={color:SUB};hd(s,"На чём обучали",6);
const data=[
  {name:"DEAM",n:"1 802",what:"Энергия и настроение\n(arousal / valence)",src:"MediaEval 2017",c:CO},
  {name:"Harmonix Set",n:"743",what:"Структура композиции\n(6 типов сегментов)",src:"Nieto et al. 2019",c:A},
  {name:"GTZAN",n:"999",what:"Жанр\n(10 классов)",src:"Tzanetakis 2002",c:GR},
];
data.forEach((d,i)=>{
  const x=.3+i*3.2;
  cd(s,x,1,3,2.2,d.c);
  s.addText(d.name,{x:x+.2,y:1.1,w:2.6,h:.3,fontSize:16,fontFace:HF,color:INK,bold:true,margin:0});
  s.addText(d.n,{x:x+.2,y:1.45,w:2.6,h:.35,fontSize:26,fontFace:MO,color:d.c,bold:true,margin:0});
  s.addText("треков",{x:x+1.6,y:1.55,w:1,h:.25,fontSize:10,fontFace:BF,color:MUT,margin:0});
  s.addText(d.what,{x:x+.2,y:1.95,w:2.6,h:.5,fontSize:11,fontFace:BF,color:MID,margin:0});
  s.addText(d.src,{x:x+.2,y:2.7,w:2.6,h:.25,fontSize:9,fontFace:BF,color:MUT,margin:0});
});
s.addText("Итого 3 544 трека · 176K обучающих окон · все три набора используются одновременно через RoundRobin",{x:.5,y:3.5,w:9,h:.3,fontSize:11,fontFace:BF,color:MID,align:"center"});

// Training approach — brief
s.addText("Обучение: Focal Loss + class weights · AdamW · differential LR (backbone 5e⁻⁵, головы 1e⁻³) · 1 GPU",{x:.5,y:4.1,w:9,h:.25,fontSize:10,fontFace:BF,color:MUT,align:"center"})}

// ═══════════════════════════════════════════
// 7 — НОВИЗНА (что нового в нашем подходе)
// ═══════════════════════════════════════════
{const s=pres.addSlide();s.background={color:BG};hd(s,"Что нового в нашем подходе",7);

const items=[
  {n:"1",title:"AST для мульти-задачного MIR",desc:"Впервые Audio Spectrogram Transformer\nприменён к одновременному анализу\nструктуры + эмоций + жанра",c:A},
  {n:"2",title:"Viterbi + музыкальные приоры",desc:"Пост-обработка с position priors:\n«Intro не бывает в середине трека»\n→ +14 пунктов Boundary F1",c:A2},
  {n:"3",title:"Сравнение 5 архитектур",desc:"CNN · CNN+BiLSTM · PANNs+Linear\n· PANNs+BiLSTM · AST\nна едином корпусе",c:GR},
];
items.forEach((it,i)=>{
  const y=1+i*1.4;
  cd(s,.5,y,9,1.2,it.c);
  s.addShape(pres.shapes.ROUNDED_RECTANGLE,{x:.7,y:y+.3,w:.5,h:.5,fill:{color:it.c},rectRadius:.08});
  s.addText(it.n,{x:.7,y:y+.3,w:.5,h:.5,fontSize:22,fontFace:HF,color:"FFFFFF",bold:true,align:"center",valign:"middle"});
  s.addText(it.title,{x:1.4,y:y+.15,w:7.5,h:.35,fontSize:17,fontFace:HF,color:INK,bold:true,margin:0});
  s.addText(it.desc,{x:1.4,y:y+.55,w:7.5,h:.55,fontSize:12,fontFace:BF,color:MID,margin:0});
})}

// ═══════════════════════════════════════════
// 8 — РЕЗУЛЬТАТЫ (chart + winner)
// ═══════════════════════════════════════════
{const s=pres.addSlide();s.background={color:SUB};hd(s,"Результаты: AST побеждает",8);
s.addChart(pres.charts.BAR,[
  {name:"Segment",labels:["CNN","CNN+LSTM","PANNs+Lin","PANNs+LSTM","AST v2"],values:[35.3,32.2,24,32.9,40.6]},
  {name:"Arousal",labels:["CNN","CNN+LSTM","PANNs+Lin","PANNs+LSTM","AST v2"],values:[62,62.3,61.2,64.9,60.6]},
  {name:"Valence",labels:["CNN","CNN+LSTM","PANNs+Lin","PANNs+LSTM","AST v2"],values:[51.7,54.2,53.8,55,51.1]},
  {name:"Genre",labels:["CNN","CNN+LSTM","PANNs+Lin","PANNs+LSTM","AST v2"],values:[83.9,60.9,81.9,77.7,81.5]},
],{x:.3,y:.9,w:6.5,h:3.8,barDir:"col",barGrouping:"clustered",chartColors:[A,CO,GO,GR],valAxisMinVal:0,valAxisMaxVal:100,showTitle:false,showValue:false,showLegend:true,legendPos:"b",legendFontSize:9,valAxisLabelFontSize:9,catAxisLabelFontSize:9});

cd(s,7.1,1,2.6,3.6,A);
s.addText("Лучшая\nмодель",{x:7.3,y:1.1,w:2.2,h:.5,fontSize:12,fontFace:BF,color:MUT,align:"center",margin:0});
s.addText("AST v2",{x:7.3,y:1.6,w:2.2,h:.4,fontSize:22,fontFace:HF,color:A,bold:true,align:"center",margin:0});
[{l:"Segment",v:"40.6%",c:A},{l:"Genre",v:"81.5%",c:GR},{l:"Среднее",v:"58.5%",c:A2}].forEach((w,i)=>{
  const y=2.2+i*.7;
  s.addText(w.v,{x:7.3,y,w:2.2,h:.35,fontSize:20,fontFace:MO,color:w.c,bold:true,align:"center",margin:0});
  s.addText(w.l,{x:7.3,y:y+.35,w:2.2,h:.2,fontSize:10,fontFace:BF,color:MUT,align:"center",margin:0})})}

// ═══════════════════════════════════════════
// 9 — ПОСТ-ОБРАБОТКА (до/после)
// ═══════════════════════════════════════════
{const s=pres.addSlide();s.background={color:BG};hd(s,"Пост-обработка: Viterbi делает разницу",9);
cd(s,.4,1,4.3,3,CO);
s.addText("Сырые предсказания",{x:.6,y:1.1,w:3.8,h:.35,fontSize:18,fontFace:HF,color:CO,bold:true,margin:0});
["28 хаотичных сегментов","«Вступление» в середине трека","Chorus ↔ Bridge каждую секунду","Boundary F1 = 0.31"].forEach((b,i)=>{
  s.addText("✕  "+b,{x:.7,y:1.65+i*.55,w:3.8,h:.4,fontSize:13,fontFace:BF,color:MID,margin:0})});
s.addText("→",{x:4.4,y:2,w:1.2,h:1,fontSize:40,fontFace:HF,color:A,align:"center",valign:"middle"});
cd(s,5.3,1,4.3,3,GR);
s.addText("После Viterbi + priors",{x:5.5,y:1.1,w:3.8,h:.35,fontSize:18,fontFace:HF,color:GR,bold:true,margin:0});
["7 осмысленных сегментов","Intro → начало, Outro → конец","Verse → Chorus → Bridge форма","Boundary F1 = 0.45"].forEach((a,i)=>{
  s.addText("✓  "+a,{x:5.5,y:1.65+i*.55,w:3.8,h:.4,fontSize:13,fontFace:BF,color:INK,margin:0})});
s.addShape(pres.shapes.ROUNDED_RECTANGLE,{x:3,y:4.3,w:4,h:.7,fill:{color:A,transparency:92},rectRadius:.06,line:{color:A,width:1.5}});
s.addText("+14 пунктов Boundary F1",{x:3,y:4.3,w:4,h:.7,fontSize:22,fontFace:HF,color:A,bold:true,align:"center",valign:"middle"})}

// ═══════════════════════════════════════════
// 10–11 — СКРИНШОТЫ (placeholder)
// ═══════════════════════════════════════════
[{n:10,t:"Прототип в действии: структура + эмоции"},{n:11,t:"Прототип: похожие треки + жанр + спектрограмма"}].forEach(({n,t})=>{
  const s=pres.addSlide();s.background={color:"0F172A"};
  s.addShape(pres.shapes.RECTANGLE,{x:0,y:0,w:10,h:.04,fill:{color:A}});
  s.addShape(pres.shapes.RECTANGLE,{x:0,y:.04,w:10,h:.04,fill:{color:A2}});
  s.addText(t,{x:.3,y:.15,w:8.5,h:.35,fontSize:15,fontFace:HF,color:"F8FAFC",bold:true,margin:0});sn(s,n);
  s.addShape(pres.shapes.ROUNDED_RECTANGLE,{x:.25,y:.6,w:9.5,h:4.8,fill:{color:"1E293B"},rectRadius:.12,line:{color:"334155",width:1,dashType:"dash"}});
  s.addText("ВСТАВЬТЕ СКРИНШОТ\nWin+Shift+S → Ctrl+V",{x:2.5,y:2.2,w:5,h:1.5,fontSize:14,fontFace:BF,color:"475569",align:"center",valign:"middle"})});

// ═══════════════════════════════════════════
// 12 — ОГРАНИЧЕНИЯ + СОТА кратко
// ═══════════════════════════════════════════
{const s=pres.addSlide();s.background={color:SUB};hd(s,"Честный взгляд: ограничения и SOTA",12);

// SOTA comparison - compact
s.addText("Сравнение с лучшими специализированными моделями:",{x:.5,y:1,w:5,h:.25,fontSize:12,fontFace:HF,color:INK,bold:true,margin:0});
[{t:"Genre",o:"83.9%",s:"89%",d:"−5.1 пп"},{t:"Segment",o:"40.6%",s:"~45%",d:"−4.4 пп"},{t:"Arousal",o:"64.9%",s:"70%",d:"−5.1 пп"}].forEach((r,i)=>{
  const y=1.4+i*.45;
  s.addText(r.t,{x:.7,y,w:1.5,h:.35,fontSize:11,fontFace:BF,color:INK,bold:true,margin:0});
  s.addText(r.o,{x:2.2,y,w:1,h:.35,fontSize:13,fontFace:MO,color:A,bold:true,align:"center",valign:"middle"});
  s.addText("vs "+r.s,{x:3.2,y,w:1.2,h:.35,fontSize:11,fontFace:BF,color:MUT,align:"center",valign:"middle"});
  s.addText(r.d,{x:4.4,y,w:1,h:.35,fontSize:11,fontFace:MO,color:MUT,align:"center",valign:"middle"})});
s.addText("Разрыв ожидаем: мы решаем 4 задачи одной моделью на 1 GPU, SOTA — одну задачу на кластерах",{x:.5,y:3,w:5,h:.3,fontSize:10,fontFace:BF,color:MUT,italic:true,margin:0});

// Limitations
s.addText("Ограничения:",{x:5.5,y:1,w:4,h:.25,fontSize:12,fontFace:HF,color:GO,bold:true,margin:0});
[{t:"GTZAN: 10 жанров 2002 г.",d:"Electronic, lo-fi не покрыты → top-3 + warning в UI"},{t:"Сегментация ≈ 40%",d:"Фундаментальное ограничение данных → Viterbi помогает"},{t:"AST = 574 МБ",d:"Тяжело для mobile → CNN-fallback 21 МБ"}].forEach((l,i)=>{
  const y=1.4+i*.85;
  cd(s,5.4,y,4.2,.7,GO);
  s.addText(l.t,{x:5.65,y:y+.05,w:3.8,h:.25,fontSize:11,fontFace:BF,color:INK,bold:true,margin:0});
  s.addText(l.d,{x:5.65,y:y+.32,w:3.8,h:.25,fontSize:9,fontFace:BF,color:MID,margin:0})});

s.addText("Дальше: FMA для современных жанров · Knowledge distillation → mobile · Real-time streaming",{x:.5,y:4.6,w:9,h:.25,fontSize:10,fontFace:BF,color:MUT,align:"center"})}

// ═══════════════════════════════════════════
// 13 — ИТОГИ
// ═══════════════════════════════════════════
{const s=pres.addSlide();s.background={color:BG};hd(s,"Итоги",13);

const res=[
  {t:"Построили единую модель для 4 задач анализа музыки",c:A},
  {t:"AST v2 — лучшая: segment 40.6%, genre 81.5%",c:A2},
  {t:"Viterbi + position priors превращают шум в структуру (+14 пп F1)",c:GR},
  {t:"Работающий веб-прототип с синхронизированным дашбордом",c:GO},
  {t:"Честно показали где модель ошибается и как это решать",c:MID},
];
res.forEach((r,i)=>{
  const y=.95+i*.82;
  cd(s,.5,y,9,.68,r.c);
  s.addShape(pres.shapes.ROUNDED_RECTANGLE,{x:.7,y:y+.14,w:.38,h:.38,fill:{color:r.c},rectRadius:.06});
  s.addText("✓",{x:.7,y:y+.14,w:.38,h:.38,fontSize:16,fontFace:BF,color:"FFFFFF",bold:true,align:"center",valign:"middle"});
  s.addText(r.t,{x:1.25,y:y+.08,w:8,h:.5,fontSize:15,fontFace:BF,color:INK,valign:"middle",margin:0})});

s.addText("Спасибо за внимание",{x:0,y:5,w:10,h:.4,fontSize:20,fontFace:HF,color:A,bold:true,align:"center"})}

// Build
pres.writeFile({fileName:path.join(__dirname,"presentation.pptx")}).then(()=>console.log("✓ presentation.pptx — "+T+" слайдов · красная нить: AST → multi-task → Viterbi → prototype"));
