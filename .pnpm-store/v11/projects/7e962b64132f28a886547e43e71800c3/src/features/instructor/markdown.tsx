// Intentionally small Markdown subset; never interpret user content as HTML.
export function Markdown({ text }: { text: string }) {
  return (
    <div className="instructor-markdown">
      {text.split(/\r?\n/).map((line, index) => {
        if (line.startsWith("### "))
          return <h4 key={index}>{line.slice(4)}</h4>;
        if (line.startsWith("## ")) return <h3 key={index}>{line.slice(3)}</h3>;
        if (line.startsWith("# ")) return <h2 key={index}>{line.slice(2)}</h2>;
        if (line.startsWith("- ")) return <p key={index}>• {line.slice(2)}</p>;
        return line ? <p key={index}>{line}</p> : <br key={index} />;
      })}
    </div>
  );
}
