const fs = require('fs');
const path = './modules/mark-chats/page.js';
let content = fs.readFileSync(path, 'utf8');

const newPt = `function Pt(t,e){const n=Ct(t);if(!n)return;n.classList.remove(vt,"snatch-limit-red","snatch-limit-yellow","snatch-limit-green","snatch-chat-red","snatch-chat-yellow","snatch-chat-green","snatch-letter-red","snatch-letter-yellow","snatch-letter-green");n.querySelectorAll(".snatch-num-badge,.snatch-num-stack").forEach(x=>x.remove());Array.from(n.querySelectorAll("svg[data-snatch-hidden]")).forEach(s=>{s.style.display=s.dataset.snatchPrevDisplay||"";delete s.dataset.snatchHidden;delete s.dataset.snatchPrevDisplay;});if(!e||(!Number.isFinite(e.chatNum)&&!Number.isFinite(e.letterNum)))return;const _lsg=(k,d)=>{try{const v=localStorage.getItem("snatch_"+k);return v!==null?v:d;}catch{return d;}};const limMode=_lsg("limMode","color");if(limMode==="off")return;const chatN=Number.isFinite(e.chatNum)?e.chatNum:null,letN=Number.isFinite(e.letterNum)?e.letterNum:null;const cR=_lsg("colRed","#ff6b6b"),cY=_lsg("colYellow","#ffc947"),cG=_lsg("colGreen","#26de81"),cMid=Number(_lsg("chatLimMid","4")),cHi=Number(_lsg("chatLimHi","7")),lMid=Number(_lsg("letLimMid","1")),lHi=Number(_lsg("letLimHi","2"));const chatCol=v=>limMode==="color"?(v>=cHi?cG:v>=cMid?cY:v>=1?cR:"#cbd5e1"):"#64748b",letCol=v=>limMode==="color"?(v>=lHi?cG:v>=lMid?cY:cR):"#94a3b8";Array.from(n.querySelectorAll("svg")).forEach(s=>{const vb=s.getAttribute("viewBox")||"";if(vb==="0 0 11 11"||vb==="0 0 10 9"){s.dataset.snatchPrevDisplay=s.style.display||"";s.dataset.snatchHidden="1";s.style.display="none";}});const stack=document.createElement("span");stack.className="snatch-num-stack notranslate";stack.setAttribute("aria-hidden","true");n.style.position="relative";stack.style.cssText="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;pointer-events:none;z-index:2;";if(chatN!==null){const t=document.createElement("span");t.className="snatch-num-badge";t.textContent=String(chatN);t.style.cssText=\`width:16px;height:16px;display:flex;align-items:center;justify-content:center;border-radius:50%;font-size:10px;font-weight:700;color:#fff;background:\${chatCol(chatN)};box-shadow:0 1px 3px rgba(0,0,0,0.1);\`;stack.appendChild(t);}if(letN!==null){const t=document.createElement("span");t.className="snatch-num-badge";t.textContent=String(letN);t.style.cssText=\`width:16px;height:16px;display:flex;align-items:center;justify-content:center;border-radius:50%;font-size:10px;font-weight:700;color:#fff;background:\${letCol(letN)};box-shadow:0 1px 3px rgba(0,0,0,0.1);\`;stack.appendChild(t);}n.prepend(stack);}`;

// Find Pt function and replace it
// The pattern is: function Pt(t,e){...}
// We need to match the balanced braces.
const startIdx = content.indexOf('function Pt(t,e){');
if (startIdx !== -1) {
  let braceCount = 0;
  let endIdx = -1;
  for (let i = startIdx; i < content.length; i++) {
    if (content[i] === '{') braceCount++;
    if (content[i] === '}') {
      braceCount--;
      if (braceCount === 0) {
        endIdx = i;
        break;
      }
    }
  }
  if (endIdx !== -1) {
    const oldFunc = content.substring(startIdx, endIdx + 1);
    content = content.replace(oldFunc, newPt);
    fs.writeFileSync(path, content);
    console.log('Successfully replaced Pt function');
  } else {
    console.log('Could not find end of Pt function');
  }
} else {
  console.log('Could not find Pt function start');
}
