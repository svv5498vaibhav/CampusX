import { useRef, useState } from 'react';

const hasErrors = (errors) => Object.values(errors).some(Boolean);

/** Maps the API's `errors: [{ field, message }]` onto form fields. */
const toFieldErrors = (apiErrors = []) =>
  Object.fromEntries(apiErrors.filter((error) => error.field).map((error) => [error.field, error.message]));

/**
 * Small form helper: values, per-field errors, a form-level error and submit state.
 * `validate(values)` returns { field: message | undefined }.
 */
export function useForm(initialValues, validate) {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const formRef = useRef(null);

  const focusFirstInvalidField = () =>
    requestAnimationFrame(() => formRef.current?.querySelector('[aria-invalid="true"]')?.focus());

  const fieldProps = (name) => ({
    name,
    value: values[name],
    error: errors[name],
    onChange: (event) => {
      const { value } = event.target;
      setValues((previous) => ({ ...previous, [name]: value }));
      if (errors[name]) setErrors((previous) => ({ ...previous, [name]: undefined }));
    },
  });

  const handleSubmit = (onSubmit) => async (event) => {
    event.preventDefault();
    if (isSubmitting) return;

    const nextErrors = validate(values);
    setErrors(nextErrors);
    setFormError('');
    if (hasErrors(nextErrors)) {
      focusFirstInvalidField();
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(values);
    } catch (error) {
      const apiFieldErrors = toFieldErrors(error.errors);
      setErrors(apiFieldErrors);
      // Field problems are shown next to the fields; anything else goes in the banner.
      setFormError(hasErrors(apiFieldErrors) ? '' : error.message || 'Something went wrong. Please try again.');
      focusFirstInvalidField();
    } finally {
      setIsSubmitting(false);
    }
  };

  return { values, errors, formError, isSubmitting, formRef, fieldProps, handleSubmit };
}
