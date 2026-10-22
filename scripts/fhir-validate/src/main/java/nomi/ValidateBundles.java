package nomi;

import ca.uhn.fhir.context.FhirContext;
import ca.uhn.fhir.context.support.DefaultProfileValidationSupport;
import ca.uhn.fhir.validation.FhirValidator;
import ca.uhn.fhir.validation.ResultSeverityEnum;
import ca.uhn.fhir.validation.SingleValidationMessage;
import ca.uhn.fhir.validation.ValidationResult;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.stream.Stream;
import org.hl7.fhir.common.hapi.validation.support.CommonCodeSystemsTerminologyService;
import org.hl7.fhir.common.hapi.validation.support.InMemoryTerminologyServerValidationSupport;
import org.hl7.fhir.common.hapi.validation.support.SnapshotGeneratingValidationSupport;
import org.hl7.fhir.common.hapi.validation.support.ValidationSupportChain;
import org.hl7.fhir.common.hapi.validation.validator.FhirInstanceValidator;

/**
 * Offline FHIR R4 validation of every bundle JSON in a directory.
 * No terminology server and no network: core R4 profiles plus in-memory
 * terminology only. Exits 1 if any message is ERROR or FATAL.
 */
public final class ValidateBundles {
  private ValidateBundles() {}

  public static void main(String[] args) throws IOException {
    Path dir = Path.of(args.length > 0 ? args[0] : "target/bundles");
    FhirContext ctx = FhirContext.forR4();
    ValidationSupportChain chain = new ValidationSupportChain(
        new DefaultProfileValidationSupport(ctx),
        new CommonCodeSystemsTerminologyService(ctx),
        new InMemoryTerminologyServerValidationSupport(ctx),
        new SnapshotGeneratingValidationSupport(ctx));
    FhirInstanceValidator module = new FhirInstanceValidator(chain);
    module.setNoTerminologyChecks(false);
    FhirValidator validator = ctx.newValidator().registerValidatorModule(module);

    List<Path> files;
    try (Stream<Path> s = Files.list(dir)) {
      files = s.filter(p -> p.toString().endsWith(".json")).sorted().toList();
    }
    if (files.isEmpty()) {
      System.err.println("No bundle JSON files in " + dir);
      System.exit(2);
    }

    int errors = 0;
    int warnings = 0;
    int infos = 0;
    for (Path file : files) {
      ValidationResult result = validator.validateWithResult(Files.readString(file, StandardCharsets.UTF_8));
      int fe = 0, fw = 0, fi = 0;
      for (SingleValidationMessage m : result.getMessages()) {
        ResultSeverityEnum sev = m.getSeverity();
        if (sev == ResultSeverityEnum.ERROR || sev == ResultSeverityEnum.FATAL) fe++;
        else if (sev == ResultSeverityEnum.WARNING) fw++;
        else fi++;
        if (sev != ResultSeverityEnum.INFORMATION) {
          System.out.printf("  %s %s: %s%n", sev, m.getLocationString(), m.getMessage());
        }
      }
      System.out.printf("%s: %d error(s), %d warning(s), %d info%n", file.getFileName(), fe, fw, fi);
      errors += fe;
      warnings += fw;
      infos += fi;
    }
    System.out.printf("TOTAL %d bundle(s): %d error(s), %d warning(s), %d info%n", files.size(), errors, warnings, infos);
    System.exit(errors > 0 ? 1 : 0);
  }
}
