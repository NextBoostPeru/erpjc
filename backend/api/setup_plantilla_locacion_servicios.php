<?php
include_once __DIR__ . '/../config/db.php';

try {
    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // Ensure tables exist
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

    $tipoContrato = 'LOCACIÓN DE SERVICIOS PROFESIONALES';

    // Ensure tipo contrato exists
    try {
        $conn->prepare("INSERT INTO contratos_tipos (nombre, activo) VALUES (?, 1)")->execute([$tipoContrato]);
    } catch (Throwable $e) {
        // already exists
    }

    // Delete existing template + sections for this type
    $stmtDel = $conn->prepare("SELECT id FROM plantillas_contratos WHERE tipo_contrato = ?");
    $stmtDel->execute([$tipoContrato]);
    while ($row = $stmtDel->fetch(PDO::FETCH_ASSOC)) {
        $conn->prepare("DELETE FROM secciones_contratos WHERE plantilla_id = ?")->execute([(int)$row['id']]);
        $conn->prepare("DELETE FROM plantillas_contratos WHERE id = ?")->execute([(int)$row['id']]);
    }

    // Create template
    $conn->prepare("INSERT INTO plantillas_contratos (nombre, tipo_contrato, descripcion) VALUES (?, ?, ?)")
        ->execute([$tipoContrato, $tipoContrato, 'Contrato de locación de servicios profesionales de naturaleza civil, sin relación de dependencia.']);
    $tplId = (int)$conn->lastInsertId();

    $sections = [];

    $sections[] = ['INTRODUCCIÓN', 'Conste por el presente documento el contrato de locación de servicios profesionales que celebran de una parte la empresa {{RAZON_SOCIAL_EMPRESA}} identificada con RUC No. {{RUC_EMPRESA}}, con domicilio legal en {{DIRECCION_EMPRESA}}, debidamente representado por {{NOMBRE_REPRESENTANTE}}, con DNI N° {{DNI_REPRESENTANTE}}, a quien en lo sucesivo se denominará {{DENOMINACION_EMPLEADOR}} y de la otra parte {{NOMBRE_COLABORADOR}}, identificado con DNI N° {{DNI_COLABORADOR}}, con domicilio en {{DIRECCION_COLABORADOR}}, a quien en lo sucesivo se denominará {{DENOMINACION_COLABORADOR}}; en los términos contenidos en las cláusulas siguientes:'];

    $sections[] = ['ANTECEDENTES', 'PRIMERA. - {{DENOMINACION_EMPLEADOR}} es una persona jurídica de derecho privado constituida bajo el régimen de la sociedad anónima, cuyo objeto social principal es la asesoría, implementación y supervisión en temas de seguridad, salud en el trabajo y medio ambiente.


SEGUNDA. - {{DENOMINACION_COLABORADOR}} es una persona natural con estudios en INGENIERÍA DE HIGIENE Y SEGURIDAD INDUSTRIAL, que se dedica habitualmente al ejercicio de su profesión en forma individual e independiente.'];

    $sections[] = ['OBJETO DEL CONTRATO', 'TERCERA. - Por el presente contrato, {{DENOMINACION_COLABORADOR}} se obliga a prestar sus servicios profesionales como {{CARGO_COLABORADOR}} en favor de {{DENOMINACION_EMPLEADOR}}, a título de locación de servicios y en los términos pactados en este contrato. Por su parte, {{DENOMINACION_EMPLEADOR}} se obliga a pagar a {{DENOMINACION_COLABORADOR}} el monto de los honorarios profesionales pactados en la cláusula sexta, en la forma y oportunidad convenidas.'];

    $sections[] = ['CARACTERES Y FORMA DE PRESTAR EL SERVICIO', 'CUARTA. - El servicio materia de este contrato será prestado por {{DENOMINACION_COLABORADOR}} en forma permanente, y comprenderá la supervisión de obras y realización de los documentos de gestión de cada una de las obras o servicios a su cargo, sin que esto implique subordinación o dependencia al empleador.


QUINTA. - El servicio objeto de la prestación a cargo de {{DENOMINACION_COLABORADOR}} tiene carácter personal, por lo que este deberá realizar dicho servicio sin valerse de auxiliares o sustitutos, ni de ningún tipo de colaboración, salvo que por razones especiales lo autorice expresamente y por escrito {{DENOMINACION_EMPLEADOR}}.'];

    $sections[] = ['HONORARIOS: FORMA Y OPORTUNIDAD DE PAGO', 'SEXTA. - Las partes acuerdan que el monto de los honorarios que pagará {{DENOMINACION_EMPLEADOR}} en calidad de contraprestación por los servicios prestados por {{DENOMINACION_COLABORADOR}}, asciende a la suma de S/. {{SALARIO}} soles.


SÉTIMA. - Los honorarios profesionales a que se refiere la cláusula anterior corresponden únicamente a los servicios de {{CARGO_COLABORADOR}}, si surgieran a propósito de estos otros aspectos que requieran los servicios de {{DENOMINACION_COLABORADOR}} y este estuviera en condiciones de brindarlos, ambas partes pactarán los honorarios profesionales correspondientes.'];

    $sections[] = ['NATURALEZA DEL CONTRATO', 'OCTAVA. - El presente contrato es de naturaleza civil, por lo tanto, queda establecido que {{DENOMINACION_COLABORADOR}} no está sujeto a relación de dependencia frente a {{DENOMINACION_EMPLEADOR}}, y en tal sentido aquel tiene plena libertad en el ejercicio de sus servicios profesionales, procurando cautelar eficientemente los intereses de este.'];

    $sections[] = ['PLAZO DEL CONTRATO', 'NOVENA. - Las partes convienen en que el plazo de este contrato será de duración determinada, teniendo como término inicial el día {{FECHA_INICIO}} y su vigencia se extenderá hasta el día {{FECHA_FIN}}.'];

    $sections[] = ['OBLIGACIONES DE LAS PARTES', 'DÉCIMA. - {{DENOMINACION_EMPLEADOR}} está obligada a pagar los honorarios profesionales de {{DENOMINACION_COLABORADOR}}, en la forma y oportunidad pactadas en la cláusula sexta de este contrato.


UNDÉCIMA. - Del mismo modo, {{DENOMINACION_EMPLEADOR}} se obliga a abonar o reembolsar, según el caso, el monto de los gastos en que se incurra durante la prestación de los servicios contratados, de acuerdo a lo señalado en la cláusula décimo quinta.


DUODÉCIMA. - {{DENOMINACION_EMPLEADOR}} se compromete a entregar oportunamente a {{DENOMINACION_COLABORADOR}} todos los documentos e información que este necesite para la prestación de sus servicios, así como a prestar su colaboración y participación en el desarrollo de estos cada vez que {{DENOMINACION_COLABORADOR}} lo requiera.


En caso que la documentación o información proporcionada por {{DENOMINACION_EMPLEADOR}} no sea veraz por razones atribuibles a esta, el contrato quedará resuelto de pleno derecho, para lo cual bastará comunicación notarial de {{DENOMINACION_COLABORADOR}}. Sin embargo, {{DENOMINACION_EMPLEADOR}} quedará obligada a pagar íntegramente los honorarios pactados en la cláusula sexta.


DÉCIMO TERCERA. - {{DENOMINACION_COLABORADOR}}, por su parte, se obliga a ejecutar la prestación a su cargo en la forma más diligente posible.


DÉCIMO CUARTA. - {{DENOMINACION_COLABORADOR}} está obligado a informar a {{DENOMINACION_EMPLEADOR}} sobre el desarrollo de los servicios contratados, cuando menos una vez por semana.'];

    $sections[] = ['GASTOS Y TRIBUTOS', 'DÉCIMO QUINTA. - Las partes acuerdan que todos los gastos y tributos que se generen como consecuencia de la celebración y ejecución de este contrato, serán de cargo de {{DENOMINACION_EMPLEADOR}}, salvo que por ley correspondan a {{DENOMINACION_COLABORADOR}}. Asimismo, {{DENOMINACION_EMPLEADOR}} hará las retenciones tributarias de ley.'];

    $sections[] = ['DOMICILIO', 'DÉCIMO SEXTA. - Para la validez de todas las comunicaciones y notificaciones a las partes, con motivo de la ejecución de este contrato, ambas señalan como sus respectivos domicilios los indicados en la introducción de este documento. El cambio de domicilio de cualquiera de las partes surtirá efecto desde la fecha de comunicación de dicho cambio a la otra parte, por cualquier medio escrito.'];

    $sections[] = ['APLICACIÓN SUPLETORIA DE LA LEY', 'DÉCIMO SÉPTIMA. - En lo no previsto por las partes en el presente contrato, ambas se someten a lo establecido por las normas del Código Civil y demás del sistema jurídico que resulten aplicables.'];

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
