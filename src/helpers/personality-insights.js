const fs = require('fs');
const ejs = require("ejs");
const puppeteer = require('puppeteer');
const api_pi = require("../services/api_personality");
const TextSummary = require("personality-text-summary");
const PersonalityTraitInfo = require('personality-trait-info');
const _ = require('lodash');

const textSummary = new TextSummary({
    version: 'v3',
    locale: 'es'
});
const TraitNames = new PersonalityTraitInfo({
    version: 'v3',
    locale: 'es',
});

const createPDF = async (html, _options = {}, path) => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    executablePath: '/usr/bin/chromium' // <-- esta línea es clave
  });

  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  await page.pdf({ path, format: 'A4' });

  await browser.close();

  return { filename: path }; // Para mantener compatibilidad si se espera un objeto similar a html-pdf
};



const buildPersonalityTraitInfo = (responseNLU) => {
  const buildTemplate = {
    Sentiment: {
      "Entity Sentiment Scores": [],
      "Keyword Sentiment Scores": []
    },
    Emotion: {
      "Entity Emotion Scores": [],
      "Keyword Emotion Scores": []
    }
  };
  
  if (responseNLU.entities && responseNLU.entities.length > 0) {
    _.forEach(responseNLU.entities, v => {
      const sentimentScore = v.sentiment.score.toFixed(2);
      buildTemplate.Sentiment['Entity Sentiment Scores'].push({
        text: v.text,
        score: sentimentScore,
        label: v.sentiment.label
      })
  
      if (v.emotion) {
        buildTemplate.Emotion['Entity Emotion Scores'].push({
          text: v.text,
          sadness: (v.emotion.sadness * 100).toFixed(2),
          joy: (v.emotion.joy * 100).toFixed(2),
          fear: (v.emotion.fear * 100).toFixed(2),
          disgust: (v.emotion.disgust * 100).toFixed(2),
          anger: (v.emotion.anger * 100).toFixed(2)
        })
      }
    });
  }
  
  if (responseNLU.keywords && responseNLU.keywords.length > 0) {
    _.forEach(responseNLU.keywords, v => {
      const sentimentScore = v.sentiment.score.toFixed(2);
      buildTemplate.Sentiment['Keyword Sentiment Scores'].push({
        text: v.text,
        score: sentimentScore,
        label: v.sentiment.label
      })
  
      if (v.emotion) {
        buildTemplate.Emotion['Keyword Emotion Scores'].push({
          text: v.text,
          sadness: (v.emotion.sadness * 100).toFixed(2),
          joy: (v.emotion.joy * 100).toFixed(2),
          fear: (v.emotion.fear * 100).toFixed(2),
          disgust: (v.emotion.disgust * 100).toFixed(2),
          anger: (v.emotion.anger * 100).toFixed(2)
        })
      }
    })
  }

  return buildTemplate;
}

const buildSentiment = (arraySentiment) => {
  let tableTRs = '';

  _.forEach(arraySentiment, v => {
    tableTRs = tableTRs.concat(
      `<tr style="border-bottom: 1px solid black;">
        <td style="width: 30%; vertical-align: middle;">${v.text}</td>
        <td style="width: 20%; vertical-align: middle; text-align: center;">${v.label.toUpperCase()}</td>
        <td style="width: 10%; vertical-align: middle; text-align: center;">${v.score}</td>
        <td style="width: 40%; vertical-align: middle;">
          <div>
            <table style="width: 100%; margin-top: 5px;">
                <tr>`
    );
    
    if (v.label.toUpperCase() === 'NEUTRAL') {
      tableTRs = tableTRs.concat(
        `<td style="width: 50%;"><div class="NEUTRAl" style="float: right; border: 1px solid black; height: 15px; width: 1%;"></div></td>
        <td style="width: 50%;"><div class="NEUTRAl" style="border: 1px solid black; height: 15px; width: 1%;"></div></td>`
      );
    } else if (v.label.toUpperCase() === 'NEGATIVE') {
      tableTRs = tableTRs.concat(
        `<td style="width: auto;"><div class="NEGATIVE" style="float: right; border: 1px solid black; height: 15px; width: ${v.score * -100}%;"></div></td>
        <td style="width: auto;"><div class="POSITIVE" style="border: 1px solid black; height: 15px; width: 0%;"></div></td>`
      );
    } else if (v.label.toUpperCase() === 'POSITIVE') {
      tableTRs = tableTRs.concat(
        `<td style="width: auto;"><div class="NEGATIVE" style="float: right; border: 1px solid black; height: 15px; width: 0%;"></div></td>
        <td style="width: auto;"><div class="POSITIVE" style="border: 1px solid black; height: 15px; width: ${v.score * 100}%;"></div></td>`
      );
    }

    tableTRs = tableTRs.concat(
      `</tr> </table> </div> </td> </tr>`
    );
  })

  return tableTRs;
}

const buildEmotion = (arrayEmotion) => {
  let tableTRs = '';

  _.forEach(arrayEmotion, v => {
    tableTRs = tableTRs.concat(
      `
      <tr><td style="width: 30%; vertical-align: middle;" colspan="3">${v.text}</td></tr>
      <tr>
        <td style="width: 30%; vertical-align: middle;">Sadness</td>
        <td style="width: 10%; vertical-align: middle; text-align: center;">${v.sadness}%</td>
        <td style="width: 60%;">
          <div>
            <table style="width: 100%;"> <tr> <td style="width: auto;"><div class="NEUTRAL" style="border: 1px solid black; height: 15px; width: ${v.sadness}%;"></div></td> </tr> </table>
          </div>
        </td>
      </tr>
      <tr>
        <td style="width: 30%; vertical-align: middle;">Joy</td>
        <td style="width: 10%; vertical-align: middle; text-align: center;">${v.joy}%</td>
        <td style="width: 60%;">
          <div>
            <table style="width: 100%;"> <tr> <td style="width: auto;"><div class="NEUTRAL" style="border: 1px solid black; height: 15px; width: ${v.joy}%;"></div></td> </tr> </table>
          </div>
        </td>
      </tr>
      <tr>
        <td style="width: 30%; vertical-align: middle;">Fear</td>
        <td style="width: 10%; vertical-align: middle; text-align: center;">${v.fear}%</td>
        <td style="width: 60%;">
          <div>
            <table style="width: 100%;"> <tr> <td style="width: auto;"><div class="NEUTRAL" style="border: 1px solid black; height: 15px; width: ${v.fear}%;"></div></td> </tr> </table>
          </div>
        </td>
      </tr>
      <tr>
        <td style="width: 30%; vertical-align: middle;">Disgust</td>
        <td style="width: 10%; vertical-align: middle; text-align: center;">${v.disgust}%</td>
        <td style="width: 60%;">
          <div>
            <table style="width: 100%;"> <tr> <td style="width: auto;"><div class="NEUTRAL" style="border: 1px solid black; height: 15px; width: ${v.disgust}%;"></div></td> </tr> </table>
          </div>
        </td>
      </tr>
      <tr style="border-bottom: 1px solid black;">
        <td style="width: 30%; vertical-align: middle;">Anger</td>
        <td style="width: 10%; vertical-align: middle; text-align: center;">${v.anger}%</td>
        <td style="width: 60%;">
          <div>
            <table style="width: 100%;"> <tr> <td style="width: auto;"><div class="NEUTRAL" style="border: 1px solid black; height: 15px; width: ${v.anger}%;"></div></td> </tr> </table>
          </div>
        </td>
      </tr>
      `
    );
  });

  return tableTRs;
}

exports.getPDF = async (text, host, path) => {
    
   // Llamada IBM NLU (Natural language understanding)
    var data = await api_pi.getPiJson(text);
    const personalityTraitInfo = buildPersonalityTraitInfo(data);
    const entitySentimentScores = buildSentiment(personalityTraitInfo.Sentiment['Entity Sentiment Scores']);
    const keywordSentimentScores = buildSentiment(personalityTraitInfo.Sentiment['Keyword Sentiment Scores']);
    const entityEmotionScores = buildEmotion(personalityTraitInfo.Emotion['Entity Emotion Scores'])
    const keywordEmotionScores = buildEmotion(personalityTraitInfo.Emotion['Keyword Emotion Scores'])

    var template = fs.readFileSync("./src/views/index.ejs", "utf-8");
    var html = ejs.render(template, {
        host: host,
        entitySentimentScores: entitySentimentScores,
        keywordSentimentScores: keywordSentimentScores,
        entityEmotionScores: entityEmotionScores,
        keywordEmotionScores: keywordEmotionScores,
    }, {
        delimiter: '$'
    });

    var result = await createPDF(html, {
      "format": 'Letter', 
      "orientation": 'landscape', 
      "border": {
          "top": "1.27cm",            // default is 0, units: mm, cm, in, px
          "right": "1.27cm",
          "bottom": "1.27cm",
          "left": "1.27cm"
      }
    }, path);

    return result;
};

function wrapTraits(data){
    return data.personality.map(function(obj) {
      const traitName = TraitNames.name(obj.trait_id);
      return {
        name: traitName,
        id: obj.trait_id,
        score: Math.round(obj.percentile * 100),
        children: obj.children.map(function(obj2) {
          const traitName2 = TraitNames.name(obj2.trait_id);
          return {
            name: traitName2,
            id: obj2.trait_id,
            score: Math.round(obj2.percentile * 100)
          }
        }).sort(function(a, b) { return b.score - a.score; })
      }
    });
  }

  function wrapNeeds(data) {
    return data.needs.map(function(obj) {
      const traitName = TraitNames.name(obj.trait_id);
      return {
        id: obj.trait_id,
        name: traitName,
        score: Math.round(obj.percentile * 100)
      }
    });
  }

  function wrapValues(data) {
    return data.values.map(function(obj) {
      const traitName = TraitNames.name(obj.trait_id);
      return {
        id: obj.trait_id,
        name: traitName,
        score: Math.round(obj.percentile * 100)
      };
    });
  }

  function sortScores(obj1, obj2) {
    return obj2.score - obj1.score;
  }
