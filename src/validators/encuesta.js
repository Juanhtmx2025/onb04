const { check, validationResult } = require("express-validator");

exports.encuesta = [
  check("q1").not().isEmpty().withMessage("Esta pregunta es obligatoria."),
  check("q2").not().isEmpty().withMessage("Esta pregunta es obligatoria."),
  check("q3").not().isEmpty().withMessage("Esta pregunta es obligatoria."),
  check("q4").not().isEmpty().withMessage("Esta pregunta es obligatoria."),
  check("q5").not().isEmpty().withMessage("Esta pregunta es obligatoria."),
  check("q6").not().isEmpty().withMessage("Esta pregunta es obligatoria."),
  check("q7").not().isEmpty().withMessage("Esta pregunta es obligatoria."),
  check("q8").not().isEmpty().withMessage("Esta pregunta es obligatoria."),
  check("q10").not().isEmpty().withMessage("Esta pregunta es obligatoria."),
  check("q11").not().isEmpty().withMessage("Esta pregunta es obligatoria."),
  check("comments")
    .trim()
    .not()
    .isEmpty()
    .withMessage("Esta pregunta es obligatoria.")
    .bail()
    .custom((value, { req }) => {
      let words = value.split(" ").length;
      if (words < 100) {
        throw new Error('Se requieren mínimo 100 palabras.');
      }
      return true;
    }),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(422).json({
        errors: errors.array(),
      });
    next();
  },
];

exports.curp = [
  check("curp")
    .trim()
    .not()
    .isEmpty()
    .withMessage("Este atributo es obligatorio.")
    .bail()
    .isLength({min: 18, max: 18}).withMessage('Se requieren 18 caracteres'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(422).json({
        errors: errors.array(),
      });
    next();
  },
];
