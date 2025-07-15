import React from 'react';

const LabeledInput = ({
  label,
  type = 'text',
  value,
  onChange,
  name,
  placeholder = '',
  required = false,
  className = '',
  ...props
}) => (
  <div className="flex flex-col">
    {label && <label className="text-gray-700 text-sm font-medium mb-1">{label}{required && ' *'}</label>}
    <input
      type={type}
      name={name}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      required={required}
      className={`p-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 transition duration-150 ${className}`}
      {...props}
    />
  </div>
);

export default LabeledInput;
