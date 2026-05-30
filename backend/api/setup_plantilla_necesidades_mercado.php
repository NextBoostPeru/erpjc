<?php
include_once __DIR__ . '/../config/db.php';

try {
    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // 1. Ensure tables exist
    $conn->exec("
        CREATE TABLE IF NOT EXISTS plantillas_contratos (
            id INT AUTO_INCREMENT PRIMARY KEY,
            nombre VARCHAR(255) NOT NULL,
            tipo_contrato VARCHAR(255) NOT NULL,
            descripcion TEXT NULL,
            area_id INT NULL,
            cargo_id INT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");

    $conn->exec("
        CREATE TABLE IF NOT EXISTS secciones_contratos (
            id INT AUTO_INCREMENT PRIMARY KEY,
            plantilla_id INT NOT NULL,
            titulo VARCHAR(255) NOT NULL,
            contenido TEXT NOT NULL,
            orden INT NOT NULL DEFAULT 0,
            FOREIGN KEY (plantilla_id) REFERENCES plantillas_contratos(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");

    $conn->exec("
        CREATE TABLE IF NOT EXISTS contratos_tipos (
            id INT AUTO_INCREMENT PRIMARY KEY,
            nombre VARCHAR(150) NOT NULL,
            activo TINYINT(1) NOT NULL DEFAULT 1,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NULL DEFAULT NULL,
            UNIQUE KEY uniq_contratos_tipos_nombre (nombre)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");

    // Ensure tipo contrato exists
    $tipoContrato = 'CONTRATO DE TRABAJO SUJETO A MODALIDAD POR NECESIDADES DEL MERCADO';
    try {
        $conn->prepare("INSERT INTO contratos_tipos (nombre, activo) VALUES (?, 1)")->execute([$tipoContrato]);
    } catch (Throwable $e) {
        // already exists
    }

    // Delete existing template + sections for this type (to replace cleanly)
    $stmtDel = $conn->prepare("SELECT id FROM plantillas_contratos WHERE tipo_contrato = ?");
    $stmtDel->execute([$tipoContrato]);
    while ($row = $stmtDel->fetch(PDO::FETCH_ASSOC)) {
        $conn->prepare("DELETE FROM secciones_contratos WHERE plantilla_id = ?")->execute([(int)$row['id']]);
        $conn->prepare("DELETE FROM plantillas_contratos WHERE id = ?")->execute([(int)$row['id']]);
    }

    // 2. Create template
    $conn->prepare("INSERT INTO plantillas_contratos (nombre, tipo_contrato, descripcion) VALUES (?, ?, ?)")
        ->execute([$tipoContrato, $tipoContrato, 'Contrato de trabajo sujeto a modalidad por necesidades del mercado conforme al D.L. 728 (D.S. 003-97-TR)']);
    $tplId = (int)$conn->lastInsertId();

    // 3. Sections
    $sections = [];

    $sections[] = ['INTRODUCCIÓN', 'Conste por el presente documento, que suscribe por triplicado con igual tenor y valor, un CONTRATO DE TRABAJO SUJETO A MODALIDAD NATURAL TEMPORAL POR NECESIDAD DE MERCADO que al amparo del Texto Único Ordenado del Decreto Legislativo Nº 728 (D.S. Nº 003-97-TR, Ley de Productividad y Compatibilidad Laboral), celebran de una parte la persona jurídica de {{RAZON_SOCIAL_EMPRESA}} identificada con RUC No. {{RUC_EMPRESA}}, con domicilio legal en {{DIRECCION_EMPRESA}}, debidamente representado por la persona de {{NOMBRE_REPRESENTANTE}}, con DNI N° {{DNI_REPRESENTANTE}}, la cual se encuentra en régimen laboral MYPE TRIBUTARIO, a quién en adelante se le llamará {{DENOMINACION_EMPLEADOR}} y de la otra parte la persona de {{NOMBRE_COLABORADOR}}, identificado con DNI N° {{DNI_COLABORADOR}}, con domicilio en {{DIRECCION_COLABORADOR}}, a quién en adelante se le llamará {{DENOMINACION_COLABORADOR}}, en los términos y condiciones siguientes:'];

    $sections[] = ['ANTECEDENTES', 'PRIMERA: {{DENOMINACION_EMPLEADOR}} tiene como objeto la asesoría, implementación y supervisión en temas de seguridad, salud en el trabajo y medio ambiente, y alquiler de andamios requiriendo por ello los servicios del trabajador en forma temporal por necesidad de mercado, de conformidad con lo dispuesto en el artículo 58 Y 74 del Texto Único Ordenado del Decreto Legislativo 728 Ley de Productividad y Competitividad Laboral, Decreto Supremo 003-97-TR.'];

    $sections[] = ['OBJETO DEL CONTRATO', 'SEGUNDO: {{DENOMINACION_EMPLEADOR}} requiere cubrir de manera temporal las necesidades de recursos humanos originados en la celebración de nuevos contratos y ordenes de servicio con nuestros clientes, y no teniendo el personal para llevar a cabo esta labor temporal prevista para el presente ejercicio, se hace necesaria la contratación de un personal temporal con la finalidad de cumplir los objetivos de los servicios para que se desempeñe como {{CARGO_COLABORADOR}}, bajo la modalidad de contrato de trabajo por Servicio Específico, que al amparo del artículo 57° del Texto Único Ordenado del Decreto Legislativo No. 728, Ley de Productividad y Competitividad Laboral, aprobado por Decreto Supremo No. 003-97-TR (LPCL).'];

    $sections[] = ['PRESTACIÓN DE SERVICIOS', 'TERCERO: {{DENOMINACION_COLABORADOR}} desempeñará sus labores en el cargo de {{CARGO_COLABORADOR}}; sin embargo, {{DENOMINACION_EMPLEADOR}} está facultado a efectuar modificaciones razonables en función a la capacidad y aptitud de {{DENOMINACION_COLABORADOR}} y a las necesidades y requerimientos de este, sin que dichas variaciones signifiquen menoscabo de categoría y/o remuneración. Queda entendido que la prestación de servicios deberá ser efectuada de manera personal, no pudiendo {{DENOMINACION_COLABORADOR}} ser reemplazado ni ayudado por tercera persona.


{{DENOMINACION_COLABORADOR}} deberá someterse al cumplimiento de la labor para la cual ha sido contratado, bajo la directiva o instrucciones de sus superiores, y las que se le impartan por necesidades del servicio en ejercicio de las facultades de administración y dirección de la empresa, de conformidad con el Artículo 9 del D.S. 003-97-TR.'];

    $sections[] = ['JORNADA Y HORARIO DE TRABAJO', 'CUARTA: El horario de trabajo dentro del cual prestará servicios {{DENOMINACION_COLABORADOR}}, será de 48 horas efectivas de labor, con una hora de descanso por refrigerio, el cual no forma parte de la citada jornada y que será tomado por {{DENOMINACION_COLABORADOR}} en la oportunidad que el empleador señale de acuerdo con las necesidades operativas de la empresa. En uso de sus facultades directrices, {{DENOMINACION_EMPLEADOR}} está facultado a efectuar modificaciones en la jornada de trabajo, de acuerdo al procedimiento establecido en el artículo 2 del Texto Único Ordenado del Decreto Legislativo N° 854, Ley de Jornada de Trabajo, Horario y Trabajo en Sobretiempo, aprobado por Decreto Supremo N° 007-2002-TR, respetando el máximo legal de 48 horas semanales, sin que dichas variaciones signifiquen menoscabo de categoría y/o remuneración.'];

    $sections[] = ['REMUNERACIÓN', 'QUINTA: {{DENOMINACION_COLABORADOR}} percibirá como contraprestación por sus servicios una remuneración mensual ascendente a la suma de S/. {{SALARIO}} soles, durante el tiempo de duración de la relación laboral, así como los beneficios que por ley le corresponden. Las ausencias injustificadas por parte de {{DENOMINACION_COLABORADOR}} implican la pérdida de la remuneración proporcionalmente a la duración de dicha ausencia, sin perjuicio del ejercicio de las facultades disciplinarias propias de {{DENOMINACION_EMPLEADOR}} previstas en la legislación laboral y normas internas de {{DENOMINACION_EMPLEADOR}}.


Será de cargo de {{DENOMINACION_COLABORADOR}} el pago del Impuesto a la Renta, aplicable a toda remuneración que se le abone, los aportes y contribuciones previsionales y sociales a su cargo, así como cualquier otro tributo que grave las remuneraciones del personal dependiente. {{DENOMINACION_EMPLEADOR}} cumplirá con efectuar las retenciones y descuentos de ley.'];

    $sections[] = ['PERIODO DE PRUEBA', 'SEXTA: {{DENOMINACION_COLABORADOR}} estará sujeto a tres (03) meses de periodo de prueba, de conformidad con lo establecido en los artículos 10 y 75 de la LPCL.'];

    $sections[] = ['DURACIÓN DEL CONTRATO', 'SÉPTIMA: La duración del presente contrato será de 02 MESES contados a partir del {{FECHA_INICIO}} al {{FECHA_FIN}}, en que concluye la prestación de servicios, sin necesidad de aviso previo entre las partes. A la conclusión del contrato {{DENOMINACION_EMPLEADOR}} abonará al {{DENOMINACION_COLABORADOR}}, los beneficios sociales que pudieran corresponderle de acuerdo a la legislación laboral vigente. No obstante, lo antes mencionado, el presente contrato podrá prorrogarse de común acuerdo, dentro de los límites previstos en el artículo 74 de la Ley de Productividad y Competitividad Laboral, D.S. N° 003-97-TR, mediante la suscripción de una prórroga.'];

    $sections[] = ['OBLIGACIONES Y FUNCIONES DEL TRABAJADOR', 'OCTAVA: {{DENOMINACION_COLABORADOR}} en el desempeño de sus labores ocupando el cargo detallado en la cláusula segunda se sujetará a las instrucciones que se le imparten y asume las obligaciones propias de tal puesto, que entre otras se encuentran en el Manual de Organización y Funciones (MOF) ajustado a su puesto específico de trabajo. La numeración de las funciones descritas en su MOF es enunciativa, mas no limitativa, pudiendo desarrollar otras funciones que le encomiende LA EMPRESA. {{DENOMINACION_COLABORADOR}} reconoce y acepta que LA EMPRESA está facultado a efectuar modificaciones razonables en su cargo y/o labores, en función a la capacidad y aptitud de éste y a las necesidades y requerimientos de LA EMPRESA, siempre que dichas modificaciones no impliquen una reducción de categoría y/o de remuneración para {{DENOMINACION_COLABORADOR}}.'];

    $sections[] = ['FUNCIONES Y RESPONSABILIDADES CORPORATIVAS', '1. Cumplimiento de la política y los objetivos de Calidad y Seguridad y Salud Ocupacional.
2. Cumplimiento de las normas legales vigentes.
3. Colaborar con la mejora continua de nuestro Sistema de Gestión de seguridad y salud en el trabajo, registrando las no conformidades encontradas en la relación proveedor - cliente interno.
4. Cumplir la función de Prevencionista en campo u obra cuando se requiera.
5. Participación en las actividades de integración, capacitación y celebración que organice la empresa.
6. Cumplimiento de los procedimientos, instructivos y planes de Seguridad correspondientes a su área de trabajo.
7. Colaborar en las auditorías internas y externas del Sistema de Gestión de seguridad y salud en el trabajo.'];

    $sections[] = ['FUNCIONES Y RESPONSABILIDADES POR ÁREA', '1. Reportar de manera inmediata cualquier acto de cualquiera de los colaboradores de las empresas en las que brindamos servicios.
2. Disponibilidad para viajar al interior del país.'];

    $sections[] = ['FUNCIONES Y RESPONSABILIDADES ESPECÍFICAS', '1. Asesor en la preparación y difusión de los procedimientos de trabajo.
2. Asegurar la implementación del Plan de Seguridad de la empresa en su área.
3. Participar en la difusión de las Políticas del Sistema de Gestión de SST.
4. Desarrollar actividades de capacitación de seguridad.
5. Responsable de comunicar a la Gerencia General o al SSOMA, en materias relacionadas a la prevención de accidentes, salud ocupacional.
6. Podrá paralizar cualquier labor en Obra, que se encuentre con evidentes condiciones y actos sub estándares que atenten contra la integridad de las personas, equipos e instalaciones y/o medioambientales hasta que se eliminen dichas condiciones y/o actos.
7. Mantener actualizada las estadísticas de seguridad de la empresa e informar periódicamente a toda la organización.
8. Identificar peligros y evaluar los riesgos a los cuales estarán expuestos los trabajadores. Aplicar medidas de control y elementos adicionales a los básicos según necesidad.
9. Mantener actualizada la base de datos con los exámenes Pre ocupacionales y ocupacionales de los trabajadores en obra, para tener certeza de la validez de los exámenes.
10. Velar que se cumpla con la entrega de la documentación requerida por el Cliente en materia de Prevención de Riesgos.
11. Capacitar a los trabajadores de obra en temas específicos relacionados con Prevención de Riesgos.
12. Velar por el cumplimiento de los estándares establecidos por la empresa, así como las normativas aplicables.
13. Realizar la investigación de incidentes, realizando el seguimiento a las acciones implementadas, midiendo su eficiencia.
14. Debe conocer y velar por el cumplimiento de los estándares en Planes de Emergencia, e investigación de incidentes.
15. Siempre debe verificar que se mantenga en terreno los documentos requeridos para los trabajos, tales como los ATS, PETs, listas de chequeo de equipos, herramientas, EPP\'s, charlas de 5 minutos, matrices de riesgos, procedimientos y cualquier otro documento necesario para el respaldo de una buena ejecución en el trabajo.'];

    $sections[] = ['NOVENA - COMPROMISOS DEL TRABAJADOR', 'NOVENA: {{DENOMINACION_COLABORADOR}} se compromete a:


Cumplir estrictamente las normas laborales, éticas, de bioseguridad, sanitarias y otras contenidas en los siguientes instrumentos:
- Reglamento de Seguridad y Salud en el Trabajo
- Plan de vigilancia, prevención y control del contagio de COVID 19 en el trabajo, aprobado por el comité de seguridad y salud en el trabajo
- Reglamento Interno de Trabajo


Realizar su trabajo y cumplir con las labores que impliquen el cargo para el cual es contratado de manera leal, diligente y en atención al principio de la buena fe laboral. Asimismo, se compromete a cumplir con las normas, procedimientos, reglamentos, así como los usos y costumbres propios del centro de trabajo, las normas sobre seguridad y salud en el trabajo, y las normas específicas que se impartan por necesidades del servicio.


A prestar servicios en forma exclusiva a favor de LA EMPRESA, por lo que durante la vigencia del presente contrato se obliga a no desempeñar otra actividad remunerada de igual naturaleza, por cuenta propia ni para ninguna otra empresa del sector en este sentido, el TRABAJADOR conviene en consagrar íntegramente su capacidad a la atención de las labores que emanen de sus funciones, comprometiéndose a desempeñar las mismas de acuerdo con los reglamentos, prácticas y políticas de LA EMPRESA, las cuales declara conocer y se obliga a cumplir fielmente.'];

    $sections[] = ['RESERVA Y CONFIDENCIALIDAD', 'DÉCIMO: {{DENOMINACION_COLABORADOR}} se compromete frente a LA EMPRESA a mantener la confidencialidad y reserva total y absoluta de toda la información y documentación que reciba de la empresa, en especial la que tenga carácter de confidencial, tanto durante la relación laboral con la empresa como en cualquier momento después de la conclusión de la misma, la cual sólo podrá ser utilizada por {{DENOMINACION_COLABORADOR}} para el desempeño de sus funciones. La obligación de confidencialidad abarca a toda aquella información revelada por LA EMPRESA a {{DENOMINACION_COLABORADOR}}, de manera verbal, escrita, por medios electrónicos, etc., así como la información obtenida por medio de sistemas de cómputo, grabada en material magnético u óptico de cualquier tipo o derivada de entrevistas o conversaciones con LA EMPRESA, con otros trabajadores de LA EMPRESA o con los clientes de LA EMPRESA, incluyendo las versiones magnetofónicas o de video que se hubieran podido obtener de las referidas entrevistas y/o conversaciones. En tal sentido, debe entenderse el término INFORMACIÓN CONFIDENCIAL en su sentido más amplio, quedando sólo excluidas de tal calificativo aquellas informaciones y documentación que estuvieran a disposición del público en general por decisión de LA EMPRESA.'];

    $sections[] = ['EXCLUSIVIDAD', 'DÉCIMO PRIMERA: {{DENOMINACION_COLABORADOR}} presta sus servicios de forma exclusiva a LA EMPRESA, de manera tal que no podrá dedicarse a otra actividad distinta de la que emana del presente contrato, salvo autorización previa, expresa y escrita de LA EMPRESA.'];

    $sections[] = ['PELIGROS, RIESGOS Y MEDIDAS DE CONTROL', 'DÉCIMO SEGUNDA: De conformidad con las normas legales vigentes, {{DENOMINACION_COLABORADOR}} declara que recibe adjunto al presente contrato, información sobre los peligros, riesgos y medidas de control correspondientes al tipo puesto para el cual es contratado.


Ambas partes declaran y reconocen que {{DENOMINACION_COLABORADOR}} se encuentra obligado a cumplir con las medidas de control en el desempeño de sus labores.'];

    $sections[] = ['RECOMENDACIONES GENERALES DE SEGURIDAD Y SALUD EN EL TRABAJO', 'DÉCIMO TERCERA: Conforme a lo dispuesto por el artículo 35º inciso c) de la Ley N.º 29783 – "Ley de Seguridad y Salud en el Trabajo (SST)", todo trabajador en el desempeño de sus funciones deberá tener presente las siguientes recomendaciones en materia de SST:


a) Asistir a todos los programas de Inducción, capacitaciones, cursos, talleres o prácticas que sea convocado a participar por parte de LA EMPRESA.

b) Colaborar activamente con el Supervisor de Seguridad y Salud en el Trabajo, en la permanente y continua labor de identificación de riesgos, incluyendo las prácticas de trabajo, la maquinaria y equipos utilizados y en general todos aquellos aspectos que puedan afectar la seguridad, salud o el medio ambiente en el lugar de trabajo.

c) Participar en los simulacros de evacuación que periódicamente programa LA EMPRESA y, en general, en todas las actividades que sean desarrolladas.

d) Observar y ejecutar un estricto cumplimiento a lo dispuesto en el Reglamento Interno de Seguridad y Salud en el Trabajo, Políticas, Protocolos, o Registros que se le proporcione, al igual que a las señales de seguridad colocadas en distintos lugares de nuestras instalaciones y a las directivas que reciba de sus superiores, o del responsable de Seguridad y Salud en el Trabajo.

e) Participar obligatoriamente en los exámenes médicos ocupacionales que organiza LA EMPRESA.

f) Contribuir con el objetivo de desarrollar y mantener una cultura preventiva en LA EMPRESA.


Todo trabajador deberá cumplir con el Reglamento de Seguridad y Salud en el Trabajo, establecido, así como las Directivas de Seguridad dictadas por {{DENOMINACION_EMPLEADOR}}, mereciendo sanción quienes las infrinjan y/o pongan en peligro su vida o la de otros trabajadores, así como la seguridad de las instalaciones. En este sentido, durante el desempeño de su labor, todo trabajador está obligado a:


a) Protegerse a sí mismo y a sus compañeros de trabajo, contra toda clase de accidentes. Conforme a ello, los trabajadores están obligados a usar los equipos de protección personal que le proporcione {{DENOMINACION_EMPLEADOR}} para la prestación de sus labores.

b) Contribuir a mantener siempre libres las vías de acceso o salida de las instalaciones.

c) Comunicar sin demora al superior inmediato todo accidente de trabajo, por leve que sea, ya sea por la persona que lo sufra o en su defecto por la primera persona que tome conocimiento del hecho, a fin de facilitar la atención de primeros auxilios y tomar las medidas preventivas necesarias.

d) Asistir a las charlas, capacitaciones y prácticas que {{DENOMINACION_EMPLEADOR}} organice en materia de seguridad y salud en el trabajo.

e) Verificar el buen estado de las herramientas, equipos y/o máquinas asignadas para la realización de sus labores, e informar a su jefe inmediato sobre las anormalidades, fallas o desperfectos que hayan notado.

f) Ningún trabajador intervendrá, cambiará, desplazará, dañará o destruirá los dispositivos de seguridad o aparatos destinados para su protección o la de terceros, ni cambiará los métodos o procedimientos adoptados por la empresa.

g) Igualmente está prohibido que el trabajador acuda a trabajar o ejecute sus labores en estado de embriaguez o bajo los efectos de drogas o cualquier sustancia y/o estupefaciente, así como introducir o ingerir bebidas alcohólicas y drogas al centro de trabajo.

h) Respetar cabalmente las Reglas de Seguridad de nuestros clientes.'];

    $sections[] = ['DÉCIMO CUARTA', 'DÉCIMO CUARTA: Los derechos y obligaciones atribuibles a las partes conforme al presente contrato no las beneficiarán ni les resultarán exigibles a ninguna de ellas hasta la fecha de inicio de la relación laboral, no pudiendo en consecuencia ser invocado su goce o cumplimiento hasta esa fecha.'];

    $sections[] = ['EXTINCIÓN DEL CONTRATO', 'DÉCIMO QUINTA: Asimismo, el vínculo laboral se extinguirá en virtud de las demás causales de extinción del contrato de trabajo, señaladas en el artículo 16 de la LPCL. En caso de despido injustificado, la indemnización se regirá por lo establecido en el artículo 76 de dicho dispositivo legal.


Con ocasión de la extinción del contrato de trabajo, {{DENOMINACION_COLABORADOR}} deberá devolver a LA EMPRESA todos los EPP\'S, herramientas, computadoras o cualquier otro equipo o bien que se le hubiese proporcionado en virtud de su relación de trabajo, incluyendo todo distintivo de identificación, tarjetas de ingreso y cualquier otro material otorgado.'];

    $sections[] = ['DOMICILIO', 'DÉCIMA SEXTA: Las partes señalan como sus respectivos domicilios los especificados en la introducción del presente contrato, por lo que se considerarán válidas todas las comunicaciones y notificaciones dirigidas a estas con motivo de la ejecución del presente contrato. El cambio de domicilio de cualquiera de las partes surtirá efecto desde la fecha de su comunicación a la contraparte, por cualquier medio escrito.


En todo lo no previsto en el presente contrato, se estará a las disposiciones laborales que regulan los contratos de trabajo sujetos a modalidad, contenidos en el D.S. 003-97-TR.'];

    // Insert sections
    $order = 1;
    $stmtSection = $conn->prepare("INSERT INTO secciones_contratos (plantilla_id, titulo, contenido, orden) VALUES (?, ?, ?, ?)");
    foreach ($sections as $sec) {
        $stmtSection->execute([$tplId, $sec[0], $sec[1], $order]);
        $order++;
    }

    echo "Plantilla creada exitosamente. ID: {$tplId}\n";
    echo "Secciones insertadas: " . ($order - 1) . "\n";

} catch (Throwable $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
$conn = null;
