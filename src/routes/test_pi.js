const fs = require('fs');
const pi = require("../helpers/personality-insights");

exports.test = async (req, res) => {
    var comments = 'Quiero agradecer la oportunidad, pondré todo el empeño para cumplir con los objetivos institucionales. Asimismo, considero importante comentar que el proceso para recibir mi computadora de trabajo fue un poco tardado, desde la entrega hasta la configuración. ¡Gracias! El encuentro con mis compañeros de trabajo hasta este momento ha sido respeto, aunque un poco frío. Felicito al equipo de Recursos Humanos, me han hecho muy agradable el ingreso a Estafeta muchas gracias. Es importante hacer de su conocimiento que todo el proceso de reclutamiento fue muy sencillo y ágil, sin embargo, al momento de integrarme a mis actividades, considero que debería de existir un acompañamiento ya que por algún motivo me sentí fuera de lugar y sin conocimiento de mis actividades. Pertenezco al área de Administración.';

    let host = req.protocol+"://"+req.headers.host;
    var filename = 'pi_' + Date.now() + '.pdf';
    var path = 'storage/' + filename;
    if (!fs.existsSync('./storage')) fs.mkdirSync('./storage');
    
    let pdf = await pi.getPDF(comments, host, path);

    console.log(pdf);
    /*pdf.createAsync(html,{
        "format": 'Letter', 
        "orientation": 'landscape', 
        "border": {
            "top": "1.27cm",            // default is 0, units: mm, cm, in, px
            "right": "1.27cm",
            "bottom": "1.27cm",
            "left": "1.27cm"
          }, 
    }).toFile(path + '.pdf', function(error, result) {
        if (error){
            console.log(err);
        } else {
          //console.log(result);
          res.send('OK');
        }          
    });*/
};