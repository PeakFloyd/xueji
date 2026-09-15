package xueji.ui;

import java.awt.BorderLayout;
import java.awt.FlowLayout;
import java.util.List;

import javax.swing.BorderFactory;
import javax.swing.JButton;
import javax.swing.JComboBox;
import javax.swing.JLabel;
import javax.swing.JOptionPane;
import javax.swing.JPanel;
import javax.swing.JScrollPane;
import javax.swing.JTable;
import javax.swing.table.DefaultTableModel;

import xueji.dao.CourseDao;
import xueji.dao.TeacherDao;
import xueji.dao.TeachingDao;
import xueji.entity.Course;
import xueji.entity.Teacher;

/**
 * 授课管理面板（教师 ↔ 课程 的多对多关系维护）。
 *
 * <p>teaching 是 m:n 联系表，没有可修改的非主属性，因此本面板只提供
 * <b>新增</b>与<b>删除</b>两种操作：下拉选择教师与课程后建立关系，
 * 或选中表格中已有关系后解除。这与通用 {@link CrudPanel} 的
 * "单表增删改"不同，故单独实现。</p>
 */
public class TeachingPanel extends JPanel {

    private static final long serialVersionUID = 1L;

    private final TeachingDao teachingDao = new TeachingDao();
    private final TeacherDao teacherDao = new TeacherDao();
    private final CourseDao courseDao = new CourseDao();

    private final DefaultTableModel model;
    private final JTable table;

    /**
     * 构造授课管理面板。
     */
    public TeachingPanel() {
        setLayout(new BorderLayout());
        model = new DefaultTableModel(
                new String[]{"教师号", "教师姓名", "课程号", "课程名"}, 0) {
            private static final long serialVersionUID = 1L;

            @Override
            public boolean isCellEditable(int row, int column) {
                return false;
            }
        };
        table = new JTable(model);

        add(buildToolbar(), BorderLayout.NORTH);
        add(new JScrollPane(table), BorderLayout.CENTER);
        refresh();
    }

    /** 顶部工具栏：新增授课 / 解除授课 / 刷新。 */
    private JPanel buildToolbar() {
        JButton addBtn = new JButton("新增授课");
        JButton delBtn = new JButton("解除授课");
        JButton refBtn = new JButton("刷新");

        addBtn.addActionListener(e -> doAdd());
        delBtn.addActionListener(e -> doDelete());
        refBtn.addActionListener(e -> refresh());

        JPanel bar = new JPanel(new FlowLayout(FlowLayout.LEFT));
        bar.add(addBtn);
        bar.add(delBtn);
        bar.add(refBtn);
        bar.setBorder(BorderFactory.createEmptyBorder(2, 2, 2, 2));
        return bar;
    }

    /** 刷新表格。 */
    public void refresh() {
        model.setRowCount(0);
        for (Object[] row : teachingDao.findAllWithNames()) {
            model.addRow(row);
        }
    }

    /** 新增授课关系：下拉选择教师与课程。 */
    private void doAdd() {
        List<Teacher> teachers = teacherDao.findAll();
        List<Course> courses = courseDao.findAll();
        if (teachers.isEmpty() || courses.isEmpty()) {
            JOptionPane.showMessageDialog(this, "请先录入教师与课程信息。");
            return;
        }

        JComboBox<Teacher> teacherBox = new JComboBox<>(teachers.toArray(new Teacher[0]));
        JComboBox<Course> courseBox = new JComboBox<>(courses.toArray(new Course[0]));
        JPanel form = new JPanel(new java.awt.GridLayout(2, 2, 6, 6));
        form.add(new JLabel("教师："));
        form.add(teacherBox);
        form.add(new JLabel("课程："));
        form.add(courseBox);

        int ok = JOptionPane.showConfirmDialog(this, form, "新增授课",
                JOptionPane.OK_CANCEL_OPTION, JOptionPane.PLAIN_MESSAGE);
        if (ok != JOptionPane.OK_OPTION) {
            return;
        }
        Teacher t = (Teacher) teacherBox.getSelectedItem();
        Course c = (Course) courseBox.getSelectedItem();
        if (t == null || c == null) {
            return;
        }
        try {
            teachingDao.insert(t.getTeacherId(), c.getCourseId());
            refresh();
            JOptionPane.showMessageDialog(this, "授课关系已新增。");
        } catch (RuntimeException e) {
            JOptionPane.showMessageDialog(this, e.getMessage(), "失败",
                    JOptionPane.ERROR_MESSAGE);
        }
    }

    /** 解除选中的授课关系。 */
    private void doDelete() {
        int r = table.getSelectedRow();
        if (r < 0) {
            JOptionPane.showMessageDialog(this, "请先在表格中选择一条授课关系。");
            return;
        }
        int real = table.convertRowIndexToModel(r);
        String teacherId = String.valueOf(model.getValueAt(real, 0));
        String courseId = String.valueOf(model.getValueAt(real, 2));
        int confirm = JOptionPane.showConfirmDialog(this,
                "确定解除该授课关系吗？", "确认", JOptionPane.YES_NO_OPTION);
        if (confirm != JOptionPane.YES_OPTION) {
            return;
        }
        try {
            teachingDao.delete(teacherId, courseId);
            refresh();
            JOptionPane.showMessageDialog(this, "已解除授课关系。");
        } catch (RuntimeException e) {
            JOptionPane.showMessageDialog(this, e.getMessage(), "失败",
                    JOptionPane.ERROR_MESSAGE);
        }
    }
}
